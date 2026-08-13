package main

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"math/big"
	"os"
	"path/filepath"
	"runtime"
	"sort"

	"github.com/cloudflare/circl/group"
	"github.com/cloudflare/circl/oprf"
	"github.com/cloudflare/circl/zk/dleq"
)

const (
	resultID       = "RC34-CIRCL-INTEROP-RESULT-0.9"
	transcriptID   = "RC34-CIRCL-TRANSCRIPTS-0.9"
	corpusID       = "RC34-SEALED-CORPUS-REVEAL-0.9"
	seedDomain     = "RC34-CORPUS-SEED-V1:"
	seedCommitment = "d49dd147dda39248ac2310005e4ddcc42bc608471fbfe196056de0d81c1896ed"
)

type packageRecord struct {
	ID       string `json:"id"`
	Length   int    `json:"length"`
	SHA256   string `json:"sha256"`
	BytesHex string `json:"bytesHex"`
}

type eventRecord struct {
	EventID   string `json:"eventId"`
	PackageID string `json:"packageId"`
	Repeated  bool   `json:"repeated"`
}

type studyRecord struct {
	StudyID     string        `json:"studyId"`
	RepeatCount int           `json:"repeatCount"`
	Events      []eventRecord `json:"events"`
}

type corpusReveal struct {
	CorpusID               string          `json:"corpusId"`
	RevealedOn             string          `json:"revealedOn"`
	PrecommitID            string          `json:"precommitId"`
	SeedHex                string          `json:"seedHex"`
	SeedCommitment         string          `json:"seedCommitment"`
	SeedCommitmentVerified bool            `json:"seedCommitmentVerified"`
	Packages               []packageRecord `json:"packages"`
	Studies                []studyRecord   `json:"studies"`
	Boundary               string          `json:"boundary"`
}

type batchTranscript struct {
	Mode                 string   `json:"mode"`
	ModeByte             int      `json:"modeByte"`
	StudyID              string   `json:"studyId"`
	PublicInfoHex        string   `json:"publicInfoHex"`
	PublicKeyHex         string   `json:"publicKeyHex"`
	EventIDs             []string `json:"eventIds"`
	PackageIDs           []string `json:"packageIds"`
	InputsHex            []string `json:"inputsHex"`
	BlindsHex            []string `json:"blindsHex"`
	BlindedElementsHex   []string `json:"blindedElementsHex"`
	EvaluatedElementsHex []string `json:"evaluatedElementsHex"`
	ProofHex             string   `json:"proofHex"`
	OutputsHex           []string `json:"outputsHex"`
	FullEvaluateMatches  bool     `json:"fullEvaluateMatches"`
	DeterministicReplay  bool     `json:"deterministicReplayMatches"`
	MutatedProofError    string   `json:"mutatedProofError"`
}

type transcriptFile struct {
	TranscriptID string            `json:"transcriptId"`
	ComputedOn   string            `json:"computedOn"`
	Library      string            `json:"library"`
	Suite        string            `json:"suite"`
	GoVersion    string            `json:"goVersion"`
	Batches      []batchTranscript `json:"batches"`
	Boundary     string            `json:"boundary"`
}

type modeMetrics struct {
	Mode                       string `json:"mode"`
	Events                     int    `json:"events"`
	RepeatedEvents             int    `json:"repeatedEvents"`
	DuplicateComparisons       int    `json:"duplicateComparisons"`
	DuplicateMatches           int    `json:"duplicateMatches"`
	DifferentPackageCollisions int    `json:"differentPackageCollisions"`
	CrossStudyOutputEqualities int    `json:"crossStudyOutputEqualities"`
	FullEvaluateMismatches     int    `json:"fullEvaluateMismatches"`
	MutatedProofAccepted       int    `json:"mutatedProofAccepted"`
}

type interopResult struct {
	ResultID         string                 `json:"resultId"`
	ComputedOn       string                 `json:"computedOn"`
	Passed           bool                   `json:"passed"`
	Library          map[string]string      `json:"library"`
	Corpus           map[string]interface{} `json:"corpus"`
	Metrics          []modeMetrics          `json:"metrics"`
	NegativeControls map[string]interface{} `json:"negativeControls"`
	Checks           map[string]bool        `json:"checks"`
	Qualification    map[string]string      `json:"qualification"`
	Conclusion       string                 `json:"conclusion"`
}

func digest(parts ...[]byte) []byte {
	h := sha256.New()
	for _, part := range parts {
		var length [4]byte
		binary.BigEndian.PutUint32(length[:], uint32(len(part)))
		h.Write(length[:])
		h.Write(part)
	}
	return h.Sum(nil)
}

func frame(parts ...[]byte) []byte {
	output := make([]byte, 0)
	for _, part := range parts {
		var length [2]byte
		binary.BigEndian.PutUint16(length[:], uint16(len(part)))
		output = append(output, length[:]...)
		output = append(output, part...)
	}
	return output
}

func hexOf(data []byte) string { return hex.EncodeToString(data) }

func createPackages(seed []byte) ([]packageRecord, map[string][]byte) {
	records := make([]packageRecord, 100)
	values := make(map[string][]byte, 100)
	for i := range 100 {
		index := []byte(fmt.Sprintf("%03d", i))
		lengthSeed := digest(seed, []byte("length"), index)
		length := 1 + int(binary.BigEndian.Uint16(lengthSeed[:2])%512)
		value := make([]byte, 0, length)
		for counter := 0; len(value) < length; counter++ {
			value = append(value, digest(seed, []byte("package"), index, []byte(fmt.Sprintf("%04d", counter)))...)
		}
		value = value[:length]
		id := fmt.Sprintf("PKG-%03d", i)
		hash := sha256.Sum256(value)
		records[i] = packageRecord{ID: id, Length: length, SHA256: hexOf(hash[:]), BytesHex: hexOf(value)}
		values[id] = value
	}
	return records, values
}

func rankedPackageIDs(seed []byte, label string, records []packageRecord) []string {
	type ranked struct{ id, rank string }
	items := make([]ranked, len(records))
	for i, record := range records {
		items[i] = ranked{record.ID, hexOf(digest(seed, []byte(label), []byte(record.ID)))}
	}
	sort.Slice(items, func(i, j int) bool { return items[i].rank < items[j].rank })
	ids := make([]string, len(items))
	for i, item := range items {
		ids[i] = item.id
	}
	return ids
}

func createStudies(seed []byte, packages []packageRecord) []studyRecord {
	studyIDs := []string{"STUDY-00", "STUDY-10", "STUDY-20", "STUDY-30"}
	repeats := []int{0, 10, 20, 30}
	studies := make([]studyRecord, len(studyIDs))
	for s, studyID := range studyIDs {
		events := make([]eventRecord, 0, 100+repeats[s])
		for _, record := range packages {
			events = append(events, eventRecord{EventID: studyID + "-BASE-" + record.ID[4:], PackageID: record.ID, Repeated: false})
		}
		selected := rankedPackageIDs(seed, "repeat:"+studyID, packages)
		for i := 0; i < repeats[s]; i++ {
			events = append(events, eventRecord{EventID: fmt.Sprintf("%s-REPEAT-%03d", studyID, i), PackageID: selected[i], Repeated: true})
		}
		sort.Slice(events, func(i, j int) bool {
			left := hexOf(digest(seed, []byte("event-order:"+studyID), []byte(events[i].EventID)))
			right := hexOf(digest(seed, []byte("event-order:"+studyID), []byte(events[j].EventID)))
			return left < right
		})
		studies[s] = studyRecord{StudyID: studyID, RepeatCount: repeats[s], Events: events}
	}
	return studies
}

func scalarFromSeed(g group.Group, seed []byte, mode, studyID string, index int) group.Scalar {
	d := digest(seed, []byte("blind"), []byte(mode), []byte(studyID), []byte(fmt.Sprintf("%04d", index)))
	s := g.NewScalar().SetBigInt(new(big.Int).SetBytes(d))
	if s.IsZero() {
		s.SetUint64(1)
	}
	return s
}

func serializeScalars(values []group.Scalar) ([]string, error) {
	output := make([]string, len(values))
	for i, value := range values {
		encoded, err := value.MarshalBinary()
		if err != nil {
			return nil, err
		}
		output[i] = hexOf(encoded)
	}
	return output, nil
}

func serializeElements(values []group.Element) ([]string, error) {
	output := make([]string, len(values))
	for i, value := range values {
		encoded, err := value.MarshalBinaryCompress()
		if err != nil {
			return nil, err
		}
		output[i] = hexOf(encoded)
	}
	return output, nil
}

func stringError(err error) string {
	if err == nil {
		return "accepted"
	}
	return err.Error()
}

func runBatch(mode, studyID string, events []eventRecord, packageValues map[string][]byte, seed []byte, key *oprf.PrivateKey) (batchTranscript, error) {
	suite := oprf.SuiteP256
	publicKey := key.Public()
	publicKeyBytes, err := publicKey.MarshalBinary()
	if err != nil {
		return batchTranscript{}, err
	}
	inputs := make([][]byte, len(events))
	info := []byte{}
	if mode == "VOPRF" {
		for i, event := range events {
			inputs[i] = frame([]byte("UP-RC34-VOPRF"), []byte(studyID), packageValues[event.PackageID])
		}
	} else {
		for i, event := range events {
			inputs[i] = packageValues[event.PackageID]
		}
		info = frame([]byte("UP-RC34-POPRF"), []byte(studyID))
	}
	blinds := make([]group.Scalar, len(events))
	for i := range events {
		blinds[i] = scalarFromSeed(suite.Group(), seed, mode, studyID, i)
	}

	var finData *oprf.FinalizeData
	var request *oprf.EvaluationRequest
	var evaluation *oprf.Evaluation
	var outputs [][]byte
	var replay [][]byte
	if mode == "VOPRF" {
		client := oprf.NewVerifiableClient(suite, publicKey)
		server := oprf.NewVerifiableServer(suite, key)
		finData, request, err = client.DeterministicBlind(inputs, blinds)
		if err == nil {
			evaluation, err = server.Evaluate(request)
		}
		if err == nil {
			outputs, err = client.Finalize(finData, evaluation)
		}
		if err == nil {
			replay, err = client.Finalize(finData, evaluation)
		}
	} else {
		client := oprf.NewPartialObliviousClient(suite, publicKey)
		server := oprf.NewPartialObliviousServer(suite, key)
		finData, request, err = client.DeterministicBlind(inputs, blinds)
		if err == nil {
			evaluation, err = server.Evaluate(request, info)
		}
		if err == nil {
			outputs, err = client.Finalize(finData, evaluation, info)
		}
		if err == nil {
			replay, err = client.Finalize(finData, evaluation, info)
		}
	}
	if err != nil {
		return batchTranscript{}, err
	}

	fullMatches := true
	for i, input := range inputs {
		var full []byte
		if mode == "VOPRF" {
			full, err = oprf.NewVerifiableServer(suite, key).FullEvaluate(input)
		} else {
			full, err = oprf.NewPartialObliviousServer(suite, key).FullEvaluate(input, info)
		}
		if err != nil || hexOf(full) != hexOf(outputs[i]) {
			fullMatches = false
		}
	}
	replayMatches := len(replay) == len(outputs)
	for i := range outputs {
		replayMatches = replayMatches && hexOf(replay[i]) == hexOf(outputs[i])
	}

	proofBytes, err := evaluation.Proof.MarshalBinary()
	if err != nil {
		return batchTranscript{}, err
	}
	mutated := append([]byte{}, proofBytes...)
	mutated[len(mutated)-1] ^= 1
	mutantProof := new(dleq.Proof)
	mutantErr := mutantProof.UnmarshalBinary(suite.Group(), mutated)
	if mutantErr == nil {
		mutantEvaluation := &oprf.Evaluation{Elements: evaluation.Elements, Proof: mutantProof}
		if mode == "VOPRF" {
			_, mutantErr = oprf.NewVerifiableClient(suite, publicKey).Finalize(finData, mutantEvaluation)
		} else {
			_, mutantErr = oprf.NewPartialObliviousClient(suite, publicKey).Finalize(finData, mutantEvaluation, info)
		}
	}

	inputHex := make([]string, len(inputs))
	outputHex := make([]string, len(outputs))
	eventIDs := make([]string, len(events))
	packageIDs := make([]string, len(events))
	for i := range inputs {
		inputHex[i] = hexOf(inputs[i])
		outputHex[i] = hexOf(outputs[i])
		eventIDs[i] = events[i].EventID
		packageIDs[i] = events[i].PackageID
	}
	blindHex, err := serializeScalars(blinds)
	if err != nil {
		return batchTranscript{}, err
	}
	blindedHex, err := serializeElements(request.Elements)
	if err != nil {
		return batchTranscript{}, err
	}
	evaluatedHex, err := serializeElements(evaluation.Elements)
	if err != nil {
		return batchTranscript{}, err
	}
	modeByte := 1
	if mode == "POPRF" {
		modeByte = 2
	}
	return batchTranscript{
		Mode: mode, ModeByte: modeByte, StudyID: studyID, PublicInfoHex: hexOf(info), PublicKeyHex: hexOf(publicKeyBytes),
		EventIDs: eventIDs, PackageIDs: packageIDs, InputsHex: inputHex, BlindsHex: blindHex,
		BlindedElementsHex: blindedHex, EvaluatedElementsHex: evaluatedHex, ProofHex: hexOf(proofBytes), OutputsHex: outputHex,
		FullEvaluateMatches: fullMatches, DeterministicReplay: replayMatches, MutatedProofError: stringError(mutantErr),
	}, nil
}

func calculateMetrics(mode string, batches []batchTranscript) modeMetrics {
	metric := modeMetrics{Mode: mode}
	firstByStudyPackage := map[string]string{}
	distinctByStudyOutput := map[string]map[string]bool{}
	baseByPackageStudy := map[string]map[string]string{}
	for _, batch := range batches {
		if batch.Mode != mode {
			continue
		}
		metric.FullEvaluateMismatches += btoi(!batch.FullEvaluateMatches)
		metric.MutatedProofAccepted += btoi(batch.MutatedProofError == "accepted")
		for i, output := range batch.OutputsHex {
			metric.Events++
			key := batch.StudyID + ":" + batch.PackageIDs[i]
			if first, ok := firstByStudyPackage[key]; ok {
				metric.RepeatedEvents++
				metric.DuplicateComparisons++
				if first == output {
					metric.DuplicateMatches++
				}
			} else {
				firstByStudyPackage[key] = output
			}
			studyOutput := batch.StudyID + ":" + output
			if distinctByStudyOutput[studyOutput] == nil {
				distinctByStudyOutput[studyOutput] = map[string]bool{}
			}
			distinctByStudyOutput[studyOutput][batch.PackageIDs[i]] = true
			if baseByPackageStudy[batch.PackageIDs[i]] == nil {
				baseByPackageStudy[batch.PackageIDs[i]] = map[string]string{}
			}
			if _, ok := baseByPackageStudy[batch.PackageIDs[i]][batch.StudyID]; !ok {
				baseByPackageStudy[batch.PackageIDs[i]][batch.StudyID] = output
			}
		}
	}
	for _, packageSet := range distinctByStudyOutput {
		if len(packageSet) > 1 {
			metric.DifferentPackageCollisions += len(packageSet) - 1
		}
	}
	for _, studies := range baseByPackageStudy {
		seen := map[string]bool{}
		for _, output := range studies {
			if seen[output] {
				metric.CrossStudyOutputEqualities++
			}
			seen[output] = true
		}
	}
	return metric
}

func btoi(value bool) int {
	if value {
		return 1
	}
	return 0
}

func writeJSON(path string, value interface{}) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	return os.WriteFile(path, data, 0o644)
}

func main() {
	seedHex := flag.String("seed", "", "32-byte sealed seed in hexadecimal")
	outputDir := flag.String("output-dir", "..", "directory for generated artifacts")
	flag.Parse()
	seed, err := hex.DecodeString(*seedHex)
	if err != nil || len(seed) != 32 {
		panic("--seed must be exactly 32 bytes of hexadecimal")
	}
	commitment := sha256.Sum256([]byte(seedDomain + *seedHex))
	if hexOf(commitment[:]) != seedCommitment {
		panic("seed does not match sealed commitment")
	}

	packages, packageValues := createPackages(seed)
	studies := createStudies(seed, packages)
	reveal := corpusReveal{
		CorpusID: corpusID, RevealedOn: "2026-08-14", PrecommitID: "RC34-SEALED-CORPUS-PRECOMMIT-0.9",
		SeedHex: *seedHex, SeedCommitment: seedCommitment, SeedCommitmentVerified: true,
		Packages: packages, Studies: studies,
		Boundary: "Synthetic byte strings are revealed only after the seed commitment was pushed. Git ordering is not a trusted timestamp or independent preregistration.",
	}

	voprfKey, err := oprf.DeriveKey(oprf.SuiteP256, oprf.VerifiableMode, seed, []byte("UP-RC34-VOPRF-SERVER"))
	if err != nil {
		panic(err)
	}
	poprfKey, err := oprf.DeriveKey(oprf.SuiteP256, oprf.PartialObliviousMode, seed, []byte("UP-RC34-POPRF-SERVER"))
	if err != nil {
		panic(err)
	}
	batches := make([]batchTranscript, 0, 8)
	for _, mode := range []string{"VOPRF", "POPRF"} {
		for _, study := range studies {
			key := voprfKey
			if mode == "POPRF" {
				key = poprfKey
			}
			batch, batchErr := runBatch(mode, study.StudyID, study.Events, packageValues, seed, key)
			if batchErr != nil {
				panic(batchErr)
			}
			batches = append(batches, batch)
		}
	}
	transcripts := transcriptFile{
		TranscriptID: transcriptID, ComputedOn: "2026-08-14", Library: "github.com/cloudflare/circl/oprf@v1.6.4",
		Suite: "P256-SHA256", GoVersion: runtime.Version(), Batches: batches,
		Boundary: "CIRCL drives both client and server paths here. The separately written Python verifier adjudicates serialized proof and output relations.",
	}

	identityRejected := false
	identityError := ""
	identityBytes, identityMarshalErr := oprf.SuiteP256.Group().Identity().MarshalBinaryCompress()
	if identityMarshalErr == nil {
		var identityKey oprf.PublicKey
		identityErr := identityKey.UnmarshalBinary(oprf.SuiteP256, identityBytes)
		identityRejected = errors.Is(identityErr, oprf.ErrInvalidPublicKey) || identityErr != nil
		identityError = stringError(identityErr)
	} else {
		identityRejected = true
		identityError = identityMarshalErr.Error()
	}
	var invalidElement = oprf.SuiteP256.Group().NewElement()
	invalidPointError := invalidElement.UnmarshalBinary(make([]byte, 33))
	invalidPointRejected := invalidPointError != nil || invalidElement.IsIdentity()

	voprfMetrics := calculateMetrics("VOPRF", batches)
	poprfMetrics := calculateMetrics("POPRF", batches)
	checks := map[string]bool{
		"sealed_seed_commitment_matches":     true,
		"one_hundred_unique_packages":        len(packages) == 100,
		"four_preregistered_studies":         len(studies) == 4,
		"all_full_evaluations_match":         voprfMetrics.FullEvaluateMismatches == 0 && poprfMetrics.FullEvaluateMismatches == 0,
		"duplicate_recall_is_complete":       voprfMetrics.DuplicateMatches == voprfMetrics.DuplicateComparisons && poprfMetrics.DuplicateMatches == poprfMetrics.DuplicateComparisons,
		"different_package_collisions_zero":  voprfMetrics.DifferentPackageCollisions == 0 && poprfMetrics.DifferentPackageCollisions == 0,
		"cross_study_output_equalities_zero": voprfMetrics.CrossStudyOutputEqualities == 0 && poprfMetrics.CrossStudyOutputEqualities == 0,
		"mutated_proofs_rejected":            voprfMetrics.MutatedProofAccepted == 0 && poprfMetrics.MutatedProofAccepted == 0,
		"identity_public_key_rejected":       identityRejected,
		"invalid_point_rejected":             invalidPointRejected,
		"primitive_replay_is_deterministic": func() bool {
			for _, b := range batches {
				if !b.DeterministicReplay {
					return false
				}
			}
			return true
		}(),
	}
	passed := true
	for _, value := range checks {
		passed = passed && value
	}
	result := interopResult{
		ResultID: resultID, ComputedOn: "2026-08-14", Passed: passed,
		Library:          map[string]string{"module": "github.com/cloudflare/circl", "version": "v1.6.4", "oprfPackage": "github.com/cloudflare/circl/oprf", "moduleSum": "h1:pOXuDTCEYyzydgUpQ0CQz3LsinKjiSk6nNP5Lt5K64U=", "released": "2026-06-19"},
		Corpus:           map[string]interface{}{"uniquePackages": 100, "studyEvents": []int{100, 110, 120, 130}, "totalEventsPerMode": 460, "seedCommitmentVerified": true},
		Metrics:          []modeMetrics{voprfMetrics, poprfMetrics},
		NegativeControls: map[string]interface{}{"identityPublicKey": map[string]interface{}{"rejected": identityRejected, "error": identityError}, "invalidPoint": map[string]interface{}{"rejected": invalidPointRejected, "error": stringError(invalidPointError)}, "mutatedProofs": "one mutation per study and mode", "deterministicReplay": "accepted with identical output by RFC 9497 primitive; delegated to resolver state"},
		Checks:           checks,
		Qualification:    map[string]string{"externalLibrary": "maintained external implementation, not claimed production-safe by its authors", "arbitraryInputInterop": "all 920 outputs and eight batch proofs separately adjudicated by the committed pure-Python audit", "constantTime": "not audited here", "liveNetwork": "not exercised", "physicalPackages": "n=0"},
		Conclusion:       "CIRCL evaluates 460 synthetic events in each of VOPRF and POPRF mode. Study scope in private input or public info preserves local equality while changing outputs across studies. Primitive replay remains deterministic by design and must be consumed exactly once by the application resolver.",
	}

	if err = os.MkdirAll(*outputDir, 0o755); err != nil {
		panic(err)
	}
	if err = writeJSON(filepath.Join(*outputDir, "rc34-sealed-corpus-reveal.json"), reveal); err != nil {
		panic(err)
	}
	if err = writeJSON(filepath.Join(*outputDir, "rc34-circl-transcripts.json"), transcripts); err != nil {
		panic(err)
	}
	if err = writeJSON(filepath.Join(*outputDir, "rc34-circl-interop-result.json"), result); err != nil {
		panic(err)
	}
	if !passed {
		os.Exit(1)
	}
	fmt.Printf("RC34 CIRCL: %d packages, %d events/mode, VOPRF and POPRF local recall %d/%d, cross-study equalities %d/%d.\n", len(packages), voprfMetrics.Events, voprfMetrics.DuplicateMatches, voprfMetrics.DuplicateComparisons, voprfMetrics.CrossStudyOutputEqualities, poprfMetrics.CrossStudyOutputEqualities)
}
