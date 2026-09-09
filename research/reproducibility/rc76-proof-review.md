# RC76 mathematical adversarial review

This is an internal handwritten mathematical review of the proposed continuation of RC75. It is not external expert review, proof-assistant verification, or a novelty claim. No physical sensor data were used.

## Model and quantifiers

Let n be a positive finite integer, α,β∈Rⁿ be known, α≠0, B∈[0,∞), and η_i∈[0,∞). The state t ranges over all R. A healthy observation has

    x_i = α_i t + β_i b + ε_i,   |b|≤B,   |ε_i|≤η_i.

Every nuisance/error combination satisfying these bounds is admissible. The noise is bounded adversarial uncertainty, not a probability distribution. The same b applies to all healthy coordinates within a world, but two competing worlds can have different b. The coefficients and bounds are exact model assumptions.

For a nonempty coordinate subset K define

    r_K = sup { d≥0 : there exists c∈[-B,B]
                       with |α_i d+β_i c|≤η_i for all i∈K }.

If α_K=0, set r_K=+∞; the displayed feasible region is indeed unbounded in d. This includes K=∅. If α_K≠0, r_K is finite and its supremum is attained: any coordinate j with α_j≠0 bounds d by (η_j+|β_j|B)/|α_j|, and the feasible region is nonempty, closed and bounded. Zero B and zero η are allowed. Write r=r_{1,…,n}.

The minimax statement below is about worst-case absolute error of a deterministic real-valued estimator over every allowed state and disturbance. It does not estimate average, high-probability or empirical error.

## Healthy-channel radius and dual certificate

The claimed equality is correct:

    inf_f sup_{t,b,ε} |f(αt+βb+ε)-t|
      = r
      = min_{w·α=1} [B|w·β| + Σ_i η_i|w_i|].

**Lower bound.** Take a maximizing pair (d,c). World + has t=d, b=c, ε_i=−(α_i d+β_i c); world − has t=−d, b=−c, ε_i=+(α_i d+β_i c). Both are allowed and both yield x=0. For any output z=f(0), max(|z−d|,|z+d|)≥d=r. No choice of nonlinear estimator escapes this same-observation lower bound.

**Upper bound.** For any w·α=1, the estimator f_w(x)=w·x has error w·β b+w·ε, whose absolute value is at most B|w·β|+Ση_i|w_i|. That bound is also attainable for that fixed w by choosing disturbance signs, although attainability for each w alone does not prove global minimax equality.

**Closing the gap by finite linear-program duality.** Maximize d over unrestricted d,c subject to ±(α_i d+β_i c)≤η_i and ±c≤B. Central symmetry makes its maximum the same as the d≥0 formulation. Its dual multipliers λ_i⁺,λ_i⁻,μ⁺,μ⁻≥0 satisfy

    Σα_i(λ_i⁺−λ_i⁻)=1,
    Σβ_i(λ_i⁺−λ_i⁻)+μ⁺−μ⁻=0.

The dual objective is Ση_i(λ_i⁺+λ_i⁻)+B(μ⁺+μ⁻). Set w_i=λ_i⁺−λ_i⁻ and minimize each sum of nonnegative positive/negative parts for fixed difference. The objective reduces exactly to Ση_i|w_i|+B|w·β|. Primal feasibility and boundedness give equal attained optima by finite LP strong duality. No strict feasibility or positive-noise assumption is needed. This proves the displayed equality, including degenerate B=0 or η_i=0 cases.

If η_i>0 at every coordinate with α_i≠0, choosing c=0 and 0<d≤min_{α_i≠0}η_i/|α_i| proves r>0. This condition is sufficient, not necessary; uncertainty in b can also make r positive when some or all η_i vanish.

## Threshold decisions

Fix m>0 and promise that t lies in L_m={t≤−m} or H_m={t≥m}. A classifier that is correct for every promised state and disturbance exists **if and only if m>r**.

For sufficiency, an estimator with error≤r cannot cross zero from either promised class when m>r; classify by its sign. For necessity, if r≥m the same-observation worlds ±r above belong to opposite classes. Equality m=r fails because the classes include their endpoints and the radius is attained. If the classes were open or the bounds not attained, the endpoint analysis would have to be redone.

This is not a classifier for arbitrary nonzero states with no margin. If r>0, choose any feasible d>0 in the lower-bound construction: states ±d have identical observations and different h(t)=1[t≥0]. Hence uniform exact zero-threshold classification fails. If r=0, exact state recovery and therefore exact threshold classification are available in this model.

## Bounded substitutions and indexed erasures

Let g,a be nonnegative integers. An adversary may erase at most a coordinates, with locations visible, and replace at most g other coordinates by arbitrary real values. Define

    k = max(0,n−2g−a),
    R_{g,a} = max_{K⊆{1,…,n}, |K|=k} r_K.

The extension is correct: the corrupted-channel minimax absolute error is R_{g,a}, including +∞, and promised closed-margin classification is possible exactly when m>R_{g,a}.

**Upper bound through the full feasible set.** For an admissible observation y let F(y) be the set of t for which some b, healthy ε, and corruption history within the budgets can produce y. If t₁,t₂∈F(y), their two witnesses have a common erased set E given by y and respective substituted sets P₁,P₂. On the complement J of E∪P₁∪P₂ both witnesses equal y. Therefore |J|≥n−a−2g. When k>0 choose K⊆J of size k. Taking half-differences d=|t₁−t₂|/2 and appropriately signed c=(b₁−b₂)/2 gives |c|≤B and |α_i d+β_i c|≤η_i for i∈K. Consequently |t₁−t₂|≤2r_K≤2R_{g,a}.

When R_{g,a}<∞, every admissible F(y) is nonempty and bounded, with diameter≤2R_{g,a}. Its midpoint estimator

    f(y) = [inf F(y)+sup F(y)]/2

has worst-case error≤R_{g,a}. Values outside the model may be rejected or assigned arbitrarily; this proof does not guarantee detection of all model violations. F(y) is a finite union of projected polyhedra obtained by enumerating candidate bad-coordinate subsets, so it can be computed with finite LPs. Enumeration need not be computationally cheap. If k=0 the upper bound is infinite and makes no finite guarantee.

**Matching constructive lower bound.** Choose a size-k K maximizing r_K. If it is finite, use a maximizing (d,c); otherwise take arbitrarily large feasible d. On K, construct the two healthy worlds t=±d,b=±c with errors giving the common value zero. Outside K choose, for example, healthy errors zero. Since |Kᶜ|≤2g+a, partition Kᶜ into E,P,Q with |E|≤a and |P|,|Q|≤g. Erase E. On P report the minus world's healthy output and on Q the plus world's healthy output. On K report zero. The plus world changes only P, the minus world changes only Q, and the observation is identical. Any estimator then has worst-case error≥d. This gives R_{g,a}, or arbitrarily large error when it is infinite.

The same collision supplies the threshold necessity whenever R_{g,a}≥m; when infinite choose d≥m. Sufficiency follows from the finite-radius midpoint estimator. A fixed linear estimator generally cannot supply this corrupted-channel upper bound: with g≥1 an adversary can make any nonzero-weight coordinate arbitrarily large. The nonlinear feasible-set construction matters.

## Explicit balanced-bias examples

Set α_i=1, B=1, and η_i=1/10. Let every β_i be +1 or −1. For a surviving coordinate subset K:

- If K contains both signs, |d+c|≤1/10 and |d−c|≤1/10 imply d≤1/10, attained by d=1/10,c=0. Thus r_K=1/10.
- If K has one sign only, r_K=11/10, attained by d=11/10,c=−1 for positive signs or c=1 for negative signs.
- If K is empty, r_K=+∞.

For p positive and q negative coordinates, R_{g,a}=1/10 when k>max(p,q), 11/10 when 1≤k≤max(p,q), and +∞ when k=0. This formula assumes the stated identical coefficients/bounds; it is not a universal sensor-count law.

| Signs | g | a | k | Exact minimax radius |
|---|---:|---:|---:|---:|
| ++−− | 0 | 0 | 4 | 1/10 |
| ++−− | 0 | 1 | 3 | 1/10 |
| ++−− | 1 | 0 | 2 | 11/10 |
| ++−− | 1 | 1 | 1 | 11/10 |
| ++−− | 2 | 0 | 0 | +∞ |
| +++−−− | 1 | 0 | 4 | 1/10 |
| +++−−− | 1 | 1 | 3 | 11/10 |

For ++−− with one substitution, an explicit collision is y=(0,0,21/10,−21/10). World + has t=11/10,b=−1, errors −1/10 on the first two coordinates and zero on the last two; its healthy output is (0,0,21/10,21/10), and only the fourth coordinate is replaced. World − uses t=−11/10,b=1, opposite first-two errors and zero last-two errors; its healthy output is (0,0,−21/10,−21/10), and only the third coordinate is replaced. This certifies failure even though the uncorrupted four-coordinate mean cancels b exactly.

For +++−−− with one substitution and one erasure, the analogous collision is y=(0,0,0,⊥,21/10,−21/10), with ±11/10 states, opposite bias endpoints, the fourth coordinate erased, and one of the final two coordinates replaced in each world.

Three coordinates of each sign are sufficient and, within the ±1 identical-bound family, necessary to preserve the 1/10 radius against one arbitrary substitution. Two substitutions can remove four coordinates from the common-healthy comparison; the counting changes accordingly.

## Failed noise-averaging inference

Adding repetitions or cancelling common bias does not reduce the worst-case deterministic noise radius below η when α_i=1 and all error intervals are [−η,η]. The worlds t=η,b=0,ε_i=−η for every i and t=−η,b=0,ε_i=η for every i both give y=0, regardless of sensor count. This is an explicit residual-uncertainty construction, not a sampling observation.

An independent zero-mean stochastic model can yield a variance or high-probability averaging benefit, but that is a different success criterion with additional distributional assumptions. Even independent Rademacher errors allow the all-aligned configuration with positive probability, so independence alone does not remove a uniform worst-case collision. Do not label the deterministic construction a refutation of statistical averaging.

## Remaining assumptions and failure boundary

The theorems close the mathematical identification question for this particular linear bounded-support model. They do not validate α,β,B,η, guarantee that a physical common disturbance has one known response vector β, handle unknown coefficient drift, or turn synthetic sensor counts into real deployment guarantees. In particular, an omitted common disturbance aligned with α is indistinguishable from t and may invalidate any reported radius. An arbitrary distribution shift is not covered. The coefficients and budgets must be transferred into a real application by separate evidence.

The argument follows set-membership/optimal-recovery and error-erasure reasoning. Its success is a complete model-conditional derivation and explicit failed-route certificates, not a claimed solution to UP-315 or UP-625 in their unrestricted form.
