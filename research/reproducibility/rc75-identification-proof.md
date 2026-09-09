# Joint-support identification with errors and erasures

## 한국어

센서의 값 하나로는 상태를 구별하지 못해도 여러 값 사이의 관계로는 구별할 수 있다. RC41은 정상 출력의 모든 좌표별 조합을 허용하는 곱집합 모형을 검사했다. 여기서는 그 조건의 필요충분성을 직접 증명하고, 공동 출력에 제약이 있는 경우까지 복원기를 확장한다. 고전 최소거리 복호 논리를 적용한 결과이며 신규 정보이론 정리라는 주장은 하지 않는다.[1–3]

### 무엇을 식별하는가

유한 집합 T는 허용된 실제 상태다. n은 유한한 양의 정수이며 각 좌표 i에는 알파벳 A_i가 있다. 정상 출력은 공집합이 아닌 S_t ⊆ A_1×…×A_n에 속한다. S_t는 관측 표본이 아니라 모형이 허용하는 **모든** 정상 출력이다. 좌표에는 신원이 있고, 소거 표지 ⊥는 정상 값과 구분된다. 비음 정수 g,a를 고정한다. 실제 x∈S_t에서 최대 a개 좌표가 위치가 알려진 소거가 되고, 비소거 좌표 최대 g개가 해당 알파벳의 임의 값으로 바뀐다. 어떤 허용 오류·소거에도 올바른 상태를 반환하는 복원기의 존재를 묻는다. 확률적 독립성은 가정하지 않는다. 고장 예산을 좌표별로 셀 수 있다는 가정과 출력의 곱집합 가정은 서로 다르다.

해밍 거리 d_H(x,z)는 다른 좌표의 수다. 서로 다른 상태 사이의 최소 거리를

δ = min { d_H(x,z) : t≠u, x∈S_t, z∈S_u }

로 정의한다. 상태가 하나뿐이면 δ=∞로 둔다. 알파벳이 무한해도 거리는 0,…,n 중 하나이므로 상태쌍이 있으면 최솟값이 달성된다.

**정리. 모든 허용 관측에서 상태를 유일하게 식별할 필요충분조건은 δ>2g+a이다.**

### 복원 알고리즘과 충분성

관측 y의 소거 위치를 E라 하자. |E|>a이면 모형 밖 관측으로 거부한다. 그 밖에는

C(y) = { t : 어떤 x∈S_t에 대해 비소거 좌표의 불일치 수가 g 이하 }

를 계산한다. 후보가 하나면 그 상태를 반환하고, 여럿이면 후보 집합을 반환하며, 없으면 모형 불일치를 반환한다. 정확한 모형과 예산 안에서 참 상태는 반드시 C(y)에 속한다. 그렇다고 모형 밖 관측을 모두 검출할 수 있는 것은 아니다. 잘못된 모형도 한 후보를 반환할 수 있다.

서로 다른 두 상태 t,u가 후보라고 가정하자. 이를 증명하는 정상 출력 x,z는 각각 비소거 좌표에서 y와 g개 이하로 다르다. 따라서 비소거 좌표에서 x,z의 차이는 2g 이하이고, 소거 좌표의 차이는 |E|≤a 이하이다. 그러므로 d_H(x,z)≤2g+a로 δ>2g+a에 모순이다. 참 상태가 후보에 들어 있고 후보가 둘일 수 없으므로 정확히 하나다. □

유한하게 명시된 S_t에는 위 식 자체가 종료하는 알고리즘이다. 정상 출력의 총수가 M이면 한 관측의 복원은 O(nM)이다. 무한하거나 암묵적으로 주어진 S_t에서는 존재성 증명이 곧 효율적인 알고리즘을 의미하지 않는다. 같은 상태 안의 정상 출력 x까지 복원할 필요는 없다.

### 필요성과 혼동 관측의 구성

δ≤2g+a이면 그 거리를 달성하는 서로 다른 상태의 x,z를 선택한다. 다른 좌표 집합 D에서 min(a,|D|)개를 소거한다. 남은 차이는 2g개 이하이므로 크기가 각각 g 이하인 P,Q로 나눌 수 있다. 관측 y를 P에서는 z의 값, 나머지 비소거 좌표에서는 x의 값으로 정한다.

x 세계에서는 P만 바꾸고, z 세계에서는 Q만 바꾸면 동일한 y가 나온다. 소거도 두 세계에서 같고 모두 허용 예산 안이다. 어떤 복원기도 이 y에 대해 두 상태에서 동시에 정답을 낼 수 없다. 이것은 탐색 실패가 아니라 명시적 불가능성 증명이다. □

### RC41의 경계가 정확한 범위

S_t=∏_i A_i(t)이고 모든 A_i(t)가 비어 있지 않다면,

d(S_t,S_u) = s(t,u) = #{ i : A_i(t)∩A_i(u)=∅ }.

서로소인 좌표에서는 반드시 다르므로 s는 하한이다. 겹치는 좌표에서는 공통 원소를, 서로소인 좌표에서는 각 집합의 원소를 선택한다. 곱집합에서는 이 선택들을 동시에 결합할 수 있어 하한을 달성한다. 따라서 min s≥2g+a+1은 이 모형의 필요충분조건이다. 기존 1,134개 검사는 일반 증명 자체가 아니라 구현의 유한 검산으로 남는다.

공동 지지집합에 제약이 있으면 좌표별 주변집합의 곱은 원래 집합보다 크다. 이 완화에서 계산한 s는 실제 δ의 하한이므로 s>2g+a는 여전히 충분하지만, s≤2g+a로 실제 식별 불가능성을 결론 내릴 수는 없다.

**기존 기준의 필요성을 깨는 최소 차원 반례:** S_0={00,11}, S_1={01,10}. 모든 좌표의 주변집합이 {0,1}이므로 s=0이지만 δ=1이다. 고장이 없으면 두 비트의 같음/다름으로 상태를 정확히 구별한다. 한 좌표에서는 주변집합과 공동집합이 같으므로 이런 반례가 없다.

**오류 하나에도 복원되는 구성:** S_0={1000,0100,0010,0001}, S_1={1111}. 주변집합은 좌표마다 겹쳐 s=0이지만 δ=3이다. 최대 한 비트 오류를 교정할 수 있다. 동시에 소거 하나까지 허용하면 2g+a=3이 되어 보장이 깨진다. 정상 출력 1000과 1111에서 두 번째 좌표를 소거하고 세 번째 값을 바꾸면 관측 1⊥10을 두 세계가 공유한다. 출력 사이의 알려진 구조가 주는 이득과, 모든 센서를 함께 바꾸는 제한 없는 공통 고장은 다른 현상이다.

### 전체 상태 대신 필요한 결론만 복원한다

목표가 h:T→L이면 서로 다른 h값을 가진 상태쌍에 대해서만 거리를 최소화한 δ_h를 사용한다. 위 충분성·필요성 증명에서 ‘서로 다른 상태’를 ‘서로 다른 h값’으로 바꾸면, **h의 강건한 식별은 δ_h>2g+a와 동치**다. 복원기는 h(C(y))가 하나일 때만 그 값을 반환한다.

예를 들어 S_0=S_1={000}, S_2={111}, h(0)=h(1)=below, h(2)=above이면 전체 상태의 δ=0이지만 δ_h=3이다. 오류 하나가 있어도 위/아래 결론은 정확하다. 이는 RC74의 결측 광량에서도 ‘정확한 총광량’과 ‘문턱 통과 여부’를 구분할 수 있다는 연결이다. 다만 실제 광량에서는 연속 지지집합과 광학적 상한을 정해야 하며, 이 이진 구성으로 별의 광량이나 H₀를 판정하지 않았다.

### 필요한 검사를 실제로 설계한다

추가 검사가 서로 독립적으로 조합 가능한 곱집합 영역을 더한다면, 각 상태쌍의 부족한 separator를 채우는 최소비용 다중 덮기 문제로 바꿀 수 있다. 이 최적화는 검사의 비용·정상 출력·고장 단위를 이미 안다는 조건 아래의 설계다.

이번 작은 구성은 기본 출력 00,01,10에 추가 검사 A(비용 2, 상태별 출력 0/1/1), B(1,0/0/1), C(1,0/1/0), D(3,0/1/2)를 허용한다. 한 오류를 교정하려면 모든 상태쌍의 거리가 3 이상이어야 한다. 16개 부분집합을 모두 검사한 결과 유일한 최소비용 해는 A+B+C, 비용 4다. 새 출력은 00000,01101,10110이며 거리는 3,3,4다. 비용 4 미만은 모두 실패한다. 이 작은 설계의 최적성은 전수 검사로 확인했으며 일반 대규모 최적화의 효율성을 증명한 것은 아니다.

### 검증과 남은 간극

JavaScript는 길이 1–3의 모든 비어 있지 않은 이진 공동 지지집합 쌍(같은 집합도 허용)과 g,a∈{0,1}의 131,064개 경우를 검사했다. 127,891개 실패 경우에는 양쪽 정상 출력과 공통 관측을 구성했다. 일반 명제는 위 증명에 근거하며 표본 검사로 일반화한 것이 아니다. 별도 Python 구현은 전방 오류·소거 채널을 열거해 비교한다. 같은 모델 계열의 별도 에이전트 검토와 구현 검산은 외부 전문가 검토나 증명 보조기 커널 검증이 아니다.

이번의 실패 경로는 ‘곱집합의 필요조건을 공동 지지집합에 그대로 적용한다’였다. 반례가 이를 기각했고, 최소 공동거리와 후보 집합 복원으로 대체했다. 새로 보정한 범위는 기존 RC41 기록을 삭제하지 않고 RC75에 남긴다. 아직 실제 센서의 S_t를 보장하는 물리 보정, 모형 오지정 아래의 안전성, 연속 상태에서의 계산 효율성은 해결하지 않았다. UP-315의 임의 대상에 대한 완전 검증이나 UP-625의 임의 분포 이동 보장을 해결했다는 주장은 하지 않는다.

다음 직접 시험은 고정된 연속 센서 모형 y_i=α_i t+β_i b+ε_i, |b|≤B, |ε_i|≤η_i에서 상태 문턱 h(t)의 양쪽에 있는 두 가능한 출력 사이 최소 불일치 좌표를 구하는 것이다. 알려진 β에서 소거 가능한 공통 b와, 범위가 검증되지 않은 b를 구분한다. 해가 있으면 반대 문턱의 두 상태와 동일 관측을 반례로 내고, 없으면 사용한 B,η에 조건부인 문턱 판정 인증서를 내는 알고리즘을 구현한다. B,η의 실측 타당성은 별도 과제이며 이번에는 수행하지 않았다.

## English

### Model and exact boundary

Let T be a finite truth set and n a positive finite dimension. For each truth t, the nonempty healthy joint support S_t is a subset of A_1×…×A_n. Supports describe every allowed healthy output, not merely a training sample. Coordinates retain their identities; erasure is a distinguished symbol outside the healthy alphabets. Fix nonnegative integers g,a. At most a positions are erased, with locations visible, and at most g remaining coordinates are replaced by arbitrary values in their respective alphabets. No probabilistic independence assumption is needed.

Define δ as the minimum Hamming distance between vectors in supports of distinct truths; set δ=∞ for a single truth. Even with infinite alphabets, a minimum is attained when cross-truth pairs exist because distances belong to {0,…,n}. **A decoder that always identifies the truth under this channel exists if and only if δ>2g+a.** This reconstructs classical minimum-distance reasoning in the repository's set-valued observation model, not a claimed new coding theorem.[1–3]

For observation y with erasure set E, reject |E|>a; otherwise compute C(y)={t: some x∈S_t differs from y in at most g unerased coordinates}. Return the unique candidate, a set on ambiguity, or model-inconsistent on an empty set. Under the assumed model the true state is always included. This does not detect every out-of-model input: an incorrect support model can still return a singleton. Explicit finite supports of total size M permit O(nM) decoding; existence alone does not provide efficient decoding for implicit or infinite sets.

**Sufficiency.** If distinct t,u survive, choose their witness vectors x,z. Their distances from y outside E are at most g each, so their mutual distance outside E is at most 2g. Positions in E add at most a. Hence d_H(x,z)≤2g+a, contradicting the assumed distance. Since the true state survives, the candidate is unique.

**Necessity and constructive collision.** Choose x,z from distinct truths with d_H(x,z)≤2g+a. Erase min(a,d_H(x,z)) disagreement positions. Partition the remaining at most 2g disagreements into P,Q of at most g positions each. Use z's values on P and x's values elsewhere outside the erasures. The resulting observation requires only P to be changed from x and only Q from z. Both admissible histories yield the same observation; no always-correct decoder can distinguish them. □

### Product supports, correlated supports and counterexamples

If S_t=∏_i A_i(t) with every coordinate support nonempty, its distance to S_u equals the number s(t,u) of disjoint coordinate supports. Disjoint positions must disagree; at intersecting positions choose a shared value. The product assumption permits these coordinate choices to occur together. Thus RC41's min s≥2g+a+1 is exactly necessary and sufficient in its rectangular model. Its earlier 1,134 cases remain finite implementation checks, not the general proof.

For constrained joint supports, the product of marginal supports is an outer approximation. Marginal separator count is a lower bound on true inter-support distance. It remains sufficient, but is no longer necessary. The minimal-dimensional example S_0={00,11}, S_1={01,10} has identical marginals, s=0 and δ=1: equality versus inequality of the two bits identifies the truth without faults. Such a counterexample cannot exist in one dimension.

The stronger example S_0={1000,0100,0010,0001}, S_1={1111} has s=0 and δ=3, correcting one arbitrary error. Allowing one erasure as well removes the guarantee: 1000 and 1111 both generate 1⊥10 with at most one error. Useful known joint-output structure is not the same as an unrestricted common fault that overwrites all coordinates.

### Target decisions and inverse design

For a target function h:T→L, minimize distance only across pairs with different h values, giving δ_h. The same two proofs show that robust identification of h is equivalent to δ_h>2g+a. Decode only when h(C(y)) is a singleton. With S_0=S_1={000}, S_2={111}, h(0)=h(1)=below and h(2)=above, full-state distance is zero but target distance is three: one-error threshold classification succeeds without full-state recovery.

This supplies a structural link to RC74: bounding a missing quantity enough to decide a threshold need not identify its exact value. Real fluxes require calibrated continuous support and optical bounds; the binary example does not adjudicate stellar flux or H₀.

For additional product-support tests, inverse design becomes a minimum-cost multicover of pairwise separator deficits. A concrete baseline has truth vectors 00,01,10. Optional tests have cost and statewise outputs A=(2;0,1,1), B=(1;0,0,1), C=(1;0,1,0), D=(3;0,1,2). Exhausting all 16 subsets gives the unique one-error-correcting optimum A+B+C at cost 4. The resulting words 00000,01101,10110 have distances 3,3,4. All cheaper subsets fail. This establishes optimality of this small construction, not efficient optimization in arbitrary dimension.

### Verification, failed route and unresolved bridge

The JavaScript experiment tests 131,064 combinations of all nonempty binary joint-support pairs in dimensions 1–3, including identical supports, at g,a∈{0,1}. It constructs witness collisions for 127,891 failing cases. A separate Python implementation enumerates the forward error/erasure channel. These computations test implementations; the general statement rests on the analytic proof above. Review by another same-model agent and a second implementation is not external scientific review or proof-assistant kernel validation.

The failed route was extending the marginal-separator necessity claim outside rectangular supports. The counterexamples reject that extension; joint-support distance and candidate-set decoding replace it. RC41's historical results remain intact. Physical calibration of S_t, validity under misspecification and efficient continuous-state algorithms remain open. Neither arbitrary finite-measurement verification in UP-315 nor arbitrary distribution-shift guarantees in UP-625 are solved.

The next executable target is the fixed model y_i=α_i t+β_i b+ε_i with |b|≤B and |ε_i|≤η_i: find the minimum number of disagreeing coordinates between admissible outputs on opposite sides of a threshold h(t). Separate removable common nuisance b with known β from an unvalidated bound on b. Return opposing-state witnesses when feasible and a conditional threshold certificate otherwise. Physical validity of B and η requires separate evidence and was not tested here.

## Sources and review boundary

1. MIT, **18.310, Matrix Hamming Codes**, §9.2. Undated course notes, reviewed 2026-09-10. Establishes the classical minimum-distance relation for arbitrary errors; not evidence of a new result here. https://math.mit.edu/classes/18.310/matrix_hamming_codes.html
2. Hamza Fawzi, Paulo Tabuada, Suhas Diggavi, **Secure estimation and control for cyber-physical systems under adversarial attacks**, arXiv:1205.5073 (2012 preprint), IEEE TAC (2014), DOI 10.1109/TAC.2014.2303233. Prior error-correction/state-reconstruction connection; the present work studies abstract measurement faults only. https://arxiv.org/abs/1205.5073
3. Reynald Affeldt and collaborators, **A Library for Formalization of Linear Error-correcting Codes**. Author-hosted manuscript, reviewed 2026-09-10. Prior formalized coding-theory work; its formal verification is not inherited by this handwritten proof. https://staff.aist.go.jp/reynald.affeldt/documents/ecc.pdf

Searches: “error erasures correction minimum distance 2t s set membership estimation uncertain measurements”; “set valued codes minimum Hamming distance uncertain outputs error correction”. These located classical distance theory and related estimation/formalization work, not a comprehensive novelty clearance. No priority claim is made. Analytical checking used the definitions above and a separately assigned same-model reviewer; Lean was not run.
