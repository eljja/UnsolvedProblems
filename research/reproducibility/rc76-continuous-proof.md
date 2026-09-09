# Common-bias cancellation, exact uncertainty and fault-tolerant decisions

## 한국어

두 센서가 같은 상태를 측정하면서 공통 교란에는 반대 방향으로 반응하면, 두 값을 더해 교란을 없앨 수 있다. 그러나 남는 잡음까지 없어지는 것은 아니다. 이번에는 교란 제거의 효과와 끝내 구별할 수 없는 상태를 같은 모형에서 계산한다. 집합 기반 추정과 선형계획 쌍대성은 기존 방법이며[1,2], 아래는 그 방법과 RC75의 오류·소거 논증을 연결한 조건부 도출이다. 새로운 일반 이론이나 실제 장치 검증을 주장하지 않는다.

### 남는 오차를 정확히 구하는 문제

n≥1, 알려진 α,β∈Rⁿ, α≠0, 유한한 B≥0와 η_i≥0를 고정한다. 상태 t는 모든 실수, 공통 편향 b는 [−B,B]를 돈다. 정상 출력은

    x_i = α_i t + β_i b + ε_i,    |ε_i|≤η_i.

위 범위의 모든 교란 조합을 허용한다. ε의 독립성·평균·분포는 가정하지 않는다. 한 세계의 모든 좌표가 같은 b를 공유하지만 서로 다른 가능한 세계는 다른 b를 가질 수 있다. 계수와 상한은 표본에서 추정한 값이 아니라 정확히 알려졌다고 가정한 값이다. 실험실 단위가 지정되지 않은 합성 모형이다.

좌표 부분집합 K에 대해

    r_K = sup {d≥0 : 어떤 |c|≤B에 대해
                         |α_i d+β_i c|≤η_i (모든 i∈K)}

로 둔다. α_K가 영벡터이면, 빈 K를 포함해 r_K=∞다. 그렇지 않으면 α_j≠0인 한 좌표가 d≤(η_j+|β_j|B)/|α_j|를 주므로 유한하며 최댓값이 달성된다. r은 전체 좌표를 쓴 r_K다.

**정리: 정상 채널에서 가능한 모든 추정기 중 최소 최악 절대오차는 정확히 r이다.** 또한

    r = min_{w·α=1} [ B|w·β| + Σ_i η_i|w_i| ].

하한은 같은 관측을 만드는 두 세계로 증명한다. 최대점 (d,c)에서 (t,b)=(d,c), ε=−(αd+βc)인 세계와 부호를 전부 뒤집은 세계는 모두 x=0을 만든다. 어떤 추정값 z도 두 상태 ±d 모두에서 오차 d 미만일 수 없다.

상한에는 추정기 w·x를 쓴다. w·α=1이면 오차는 (w·β)b+w·ε이므로 표시한 목적함수 이하이다. 상한과 하한의 일치를 닫기 위해 d,c를 자유변수로 두고 ±(α_i d+β_i c)≤η_i, ±c≤B 아래 d를 최대화한다. 중앙대칭 때문에 d≥0을 따로 넣지 않아도 최대값이 같다. 쌍대 승수 λ_i⁺,λ_i⁻,μ⁺,μ⁻≥0의 조건은

    Σα_i(λ_i⁺−λ_i⁻)=1,
    Σβ_i(λ_i⁺−λ_i⁻)+μ⁺−μ⁻=0.

목적함수는 Ση_i(λ_i⁺+λ_i⁻)+B(μ⁺+μ⁻)다. w_i=λ_i⁺−λ_i⁻로 두고 각 양·음 부분의 합을 최소화하면 위 절댓값 식이 된다. 실행 가능하고 유계인 유한 선형계획의 강한 쌍대성[1]으로 두 최적값은 같고 달성된다. B=0 또는 η_i=0이어도 엄격한 내부점 가정을 추가할 필요가 없다. □

### 문턱 판정은 언제 가능한가

m>0을 고정하고 t≤−m 또는 t≥m이라고 약속한 문제는 **m>r일 때, 그리고 그때만** 모든 허용 교란 아래 판정 가능하다. 오차 r 이하의 추정값은 이때 부호가 뒤집히지 않는다. 반대로 r≥m이면 앞의 ±r 두 세계가 서로 다른 클래스에 속하면서 같은 관측을 만든다. 닫힌 클래스이므로 등호 m=r에서도 실패한다. 이 여유폭 약속은 원래의 모든 실수 상태 판정에 추가한 조건이다.

r>0이면 여유폭 없는 h(t)=1[t≥0]의 일률적 정확 판정은 불가능하다. 예를 들어 α=(1,1), β=(1,−1), B=1, η_i=1/10에서 t=1/20, b=0, ε_i=−1/20과 t=−1/20, b=0, ε_i=1/20은 모두 (0,0)을 만든다. 모든 신호 좌표에 양의 잡음 상한이 있으면 c=0, 0<d≤min_{α_i≠0}η_i/|α_i|를 선택할 수 있어 일반적으로도 r>0이다.

이는 개별 관측의 확정 판정까지 막는 것은 아니다. 같은 모형에서 y=(1/2,−1/10)을 실제 입력으로 계산하면 가능한 t는 정확히 [1/10,3/10]이고 모두 양수다. 공통 b의 결합조건을 버리고 센서별 구간만 교차하면 [−3/5,1]로 넓어져 부호를 판정하지 못한다. 두 끝점 모두 b=3/10인 허용 세계가 달성한다. 단순히 좁은 구간을 제안한 것이 아니라 제약을 만족하는 끝점과 구간 밖을 배제하는 계산을 함께 만들었다.

### 큰 오류가 섞이면 선형 상쇄만으로 부족하다

비음 정수 g,a를 고정한다. 위치가 드러난 소거를 최대 a개, 남은 좌표의 임의 실수 치환을 최대 g개 허용한다. 두 가능한 세계가 같은 관측을 만들었다면 최소 n−2g−a개 좌표에서는 양쪽 정상 출력이 같다. 따라서

    k=max(0,n−2g−a),    R_{g,a}=max_{|K|=k} r_K

가 정확한 최악오차 반경이다. 유한한 경우 달성 추정기는 **관측과 양립하는 모든 t의 집합 F(y)의 양 끝점 중점**이다. F는 후보 고장 위치마다 얻는 구간들의 합집합이며 한 가지 고장 위치를 먼저 확정하지 않는다.

상한: F(y)의 두 상태 t₁,t₂가 공유하는 정상 좌표 중 k개를 K로 잡는다. 상태와 편향의 반차이를 d=|t₁−t₂|/2와 대응 부호의 c로 두면 |c|≤B, |α_i d+β_i c|≤η_i다. 그러므로 F(y)의 지름은 2R_{g,a} 이하이며 중점 오차는 R_{g,a} 이하다.

하한: 가장 큰 r_K의 (d,c)에서 K 좌표에 공통 출력 0을 만드는 ±세계들을 구성한다. K 밖의 좌표를 최대 a개 소거와 양쪽 최대 g개 치환으로 나누고, 각 위치에서 한쪽 정상 출력을 보고한다. 그러면 두 세계가 하나의 손상 관측을 공유한다. r_K=∞이면 d를 임의로 크게 잡을 수 있으므로 유한 최악오차 보장이 없다. 이로써 상한·하한이 일치한다. 여유폭 판정의 경계도 m>R_{g,a}로 바뀐다. □

g≥1이면 고정 선형 추정기로 이 상한을 달성할 수 없다. 0이 아닌 가중치가 붙은 좌표 하나를 임의로 크게 치환하면 추정값이 무한히 움직인다. 비선형 후보집합 복원은 이 실패를 피한다. 여섯 센서의 β=(1,1,1,−1,−1,−1)에서 y=(10,1/2,1/2,−1/10,−1/10,−1/10), g=1, a=0을 입력해 F(y)=[1/10,3/10]을 얻었다. 이 예제에서는 첫 좌표를 고장으로 제외한 가지에만 해가 남았다. 단순 평균은 107/60이며 참값 t=1/5에서 크게 벗어난다.

### 필요한 센서 구성을 역으로 구한다

α_i=1, β_i∈{−1,1}, B>0, 모든 η_i=η인 설계군으로 범위를 제한한다. 남은 K에 두 부호가 모두 있으면 |d+c|≤η와 |d−c|≤η를 더해 d≤η이고, d=η,c=0으로 달성한다. 한 부호만 있으면 d=B+η를 달성한다. 따라서 잡음 반경 η를 유지하려면 두 부호가 각각 2g+a+1개 이상 필요충분하다.

| 구성 | 치환 g | 소거 a | 정확한 반경 (B=1, η=1/10) |
|---|---:|---:|---:|
| ++−− | 1 | 0 | 11/10 |
| +++−−− | 1 | 0 | 1/10 |
| +++−−− | 1 | 1 | 11/10 |
| ++++−−−− | 1 | 1 | 1/10 |

즉 이 설계군에서 한 치환에는 최소 여섯 개, 한 치환과 한 소거에는 최소 여덟 개가 필요하다. 임의 감도·장비에 대한 보편적 최소 센서 수는 아니다. ++−−에서 한 치환의 실패를 보여주는 구체적 관측은 (0,0,21/10,−21/10)이다. 상태 11/10, b=−1은 정상 출력 (0,0,21/10,21/10)의 마지막 값을, 상태 −11/10, b=1은 (0,0,−21/10,−21/10)의 세 번째 값을 바꾸면 이 관측을 만든다. 두 세계의 첫 두 잡음은 각각 −1/10과 +1/10이다.

센서를 반복해서 늘려도 결정론적 잡음 반경 η 아래로 내려가지는 않는다. 모든 좌표에서 t=±η, b=0, ε_i=∓η인 세계들이 계속 같은 0 관측을 만든다. 독립·영평균 잡음의 분산 감소는 다른 가정과 확률적 성공 기준이므로 이 반례가 통계적 평균화를 반박하는 것은 아니다.

### 실제 산출물과 미해결 연결

JavaScript는 정수 분수 연산으로 1,152개 일반 계수 모형에서 원·쌍대 가능점과 최적값 일치를 검사했다. 대표 구성에는 최대점, 비음 쌍대 승수, 같은 관측을 만드는 양쪽 상태·편향·잡음·치환 위치를 저장했다. 관측별 후보구간 계산도 실행했다. 별도 Python 분수 구현은 4,320개 매개변수·고장 조합과 34,452개 부분집합 검사를 수행했다. 반복되는 27개 다각형을 캐시한 사실도 기록했다. 불일치는 없었다. 계산은 유한 구현 검사이고 일반 명제의 근거는 위 논증이다. 같은 모델의 별도 에이전트 검토는 외부 전문가나 증명 보조기 검증이 아니다.

제공한 관측 복원 코드는 모든 유지 좌표의 α가 0인 가지에서는 명시적으로 중단한다. 그러한 가지의 불가능성 또는 비유계성을 판정하는 일반 선형계획기는 구현하지 않았다. 현재 실행한 α_i=1 구성에는 이 제한이 나타나지 않는다. 일반 반경 계산은 α_K=0이면 ∞를 반환한다.

원문제로 돌아가는 의존관계는 ‘분포 이동 또는 장치 변화 뒤에도 타당한 판정 ← 실제로 보장된 지원집합·고장 한도 ← 물리적으로 검증된 α,β,B,η ← 이번의 조건부 반경·복원기’다. 마지막 화살표만 닫았다. 유한 표본이 전체 지원을 보장한다는 정리, 계수 드리프트의 상한, 실제 센서 자료는 확보하지 않았다. UP-315의 임의 장치 완전 검증과 UP-625의 임의 분포 이동 보장을 해결하지 않았다.

다음 실행에서는 β_i=β̄_i+u_i, |u_i|≤ρ_i를 넣고 남는 u_i b 항을 직접 공격한다. 먼저 명시한 계수 오차 상한에서 서로 반대 문턱의 상태가 같은 관측을 만드는지 계산한다. 단순히 η_i에 Bρ_i를 더한 외부 근사와 공동 b를 보존한 정확한 식별집합이 어디서 달라지는지 판정한다. 이번에는 실행하지 않았다. 이 상한의 실제 보정은 별도 과제다.

## English

Two sensors can respond oppositely to a common nuisance so that adding their readings cancels it. The bounded residual errors need not cancel. This derivation computes both a best guarantee and indistinguishable worlds in the same model. Set-membership estimation and LP duality are established methods [1,2]; this is their conditional application together with RC75's error/erasure argument, not a new general theory or a physical validation.

### Exact minimax radius

Fix n≥1, known α,β∈Rⁿ with α≠0, finite B≥0 and η_i≥0. Let t range over all R, |b|≤B and |ε_i|≤η_i, with every bounded combination admissible. Healthy readings are x_i=α_i t+β_i b+ε_i. No distribution, independence or zero-mean assumption is imposed. A world shares one b across its coordinates; different worlds may use different b. Coefficients and bounds are exact assumptions, not estimated support guarantees. Numerical fixtures have no claimed physical units.

For K define r_K=sup{d≥0: ∃|c|≤B, |α_i d+β_i c|≤η_i for i∈K}. Set r_K=∞ when α_K=0, including empty K. Otherwise any nonzero α_j bounds d by (η_j+|β_j|B)/|α_j|, and compactness gives an attained finite maximum. Write r for the full-coordinate radius.

The optimal worst-case absolute error, over all estimators and all allowed worlds, equals

    r = min_{w·α=1} B|w·β| + Ση_i|w_i|.

For the lower bound, a maximizing (d,c) gives worlds (t,b)=(d,c), ε=−(αd+βc), and its sign reversal. Both yield zero. Any estimate has error at least d in one world. For the upper bound, w·x with w·α=1 has error at most the displayed objective.

To close the gap, maximize unrestricted d subject to ±(α_i d+β_i c)≤η_i and ±c≤B. Symmetry makes the extra d≥0 restriction unnecessary. Its nonnegative dual multipliers satisfy Σα_i(λ_i⁺−λ_i⁻)=1 and Σβ_i(λ_i⁺−λ_i⁻)+μ⁺−μ⁻=0. The cost is Ση_i(λ_i⁺+λ_i⁻)+B(μ⁺+μ⁻). Setting w_i=λ_i⁺−λ_i⁻ and minimizing the positive/negative sums gives the absolute-value objective. Finite LP strong duality [1] gives equal attained optima, also when B or some η_i are zero. This is a full conditional argument, not a generalization from numerical samples.

### Thresholds: a promise versus an observed certificate

For a fixed m>0, the promised closed classes t≤−m and t≥m are uniformly distinguishable iff m>r. An error-r estimator cannot cross zero under that strict inequality. If r≥m the zero-observation worlds ±r lie in different classes. Equality fails because endpoints are included and the radius is attained. The margin promise is an additional restriction, not the unrestricted original problem.

If r>0, uniform exact h(t)=1[t≥0] classification without a margin is impossible. In α=(1,1), β=(1,−1), B=1, η_i=1/10, the worlds t=±1/20, b=0, ε_i=∓1/20 both yield (0,0). More generally, strictly positive η_i on every nonzero signal coordinate permits c=0 and a positive d≤min η_i/|α_i|, hence r>0.

Individual observations can still certify a sign. Executing the feasible-set calculation on y=(1/2,−1/10) gives exactly t∈[1/10,3/10], entirely positive. Both endpoints are attained with b=3/10. Replacing the joint common-bias constraint by separate marginal intervals gives [−3/5,1], losing this decision. The calculation retains endpoint witnesses as well as constraints excluding values outside the interval.

### Arbitrary replacements and visible erasures

Allow g≥0 arbitrary real replacements and a≥0 indexed erasures, both integer budgets. Set k=max(0,n−2g−a) and R_{g,a}=max_{|K|=k}r_K. The corrupted-channel minimax absolute error is exactly R_{g,a}, including infinity. For finite radius, an attaining estimator is the midpoint of the extrema of the entire feasible-state set F(y), a union over possible bad-coordinate sets, rather than a chosen single failure explanation.

For the upper bound, two compatible worlds have at least n−2g−a common healthy coordinates. Half their state and bias differences satisfy the subset constraints on some size-k K, so their state distance is at most 2R_{g,a}. The midpoint of inf F and sup F therefore has error at most R_{g,a}. For the lower bound, select a maximizing K and its (d,c). Make the ± worlds share zero on K, then partition its complement into at most a common erasures and at most g replacements for each world. Report the other world's healthy values on the corresponding replacement positions. Both histories give one observation. An unbounded r_K permits arbitrarily large d. Promised-margin classification consequently holds iff m>R_{g,a}.

For g≥1, any fixed nonzero linear estimator has infinite worst-case error: replace a coordinate carrying nonzero weight by an arbitrarily large value. The nonlinear feasible-set construction is essential. With β=(1,1,1,−1,−1,−1), α_i=1, B=1, η_i=1/10, the executed input (10,1/2,1/2,−1/10,−1/10,−1/10), g=1,a=0 gives F=[1/10,3/10]. Only the branch dropping the first coordinate is feasible in this fixture. The ordinary mean is 107/60, far from the admissible truth 1/5.

### A restricted inverse design with an exact minimum

Restrict designs to α_i=1, β_i∈{−1,1}, a common η and B>0. A retained subset with both signs satisfies |d+c|≤η and |d−c|≤η, hence has radius η, attained at d=η,c=0. A one-sign subset has radius B+η. To retain the η radius, each sign must therefore appear at least 2g+a+1 times. This is necessary and sufficient within this family, not a universal sensor-count law.

At B=1,η=1/10, four balanced sensors with one replacement have radius 11/10; six balanced sensors reduce it to 1/10. Adding one erasure to those six raises it back to 11/10; eight balanced sensors preserve 1/10 against one replacement and one erasure. Thus the family-specific minimum counts are six and eight respectively.

The four-sensor failure has explicit observation (0,0,21/10,−21/10). The positive world t=11/10,b=−1 has healthy output (0,0,21/10,21/10) and changes the final coordinate. The negative world t=−11/10,b=1 has (0,0,−21/10,−21/10) and changes the third. The first two errors are respectively −1/10 and +1/10. Both obey all bounds.

Repetition cannot lower the deterministic radius below η: for any sensor count, t=±η,b=0,ε_i=∓η yields identical zero readings. This does not refute variance reduction under an independent zero-mean stochastic model, which uses different assumptions and success criteria.

### Executed checks and remaining bridge

JavaScript uses exact integer fractions to check matching primal/dual bounds for 1,152 general-coefficient models. Representative outputs preserve maximizing points, nonnegative dual multipliers and full collision histories. Observation-specific feasible intervals were also computed. A separate Python Fraction implementation checked 4,320 parameter/fault configurations and 34,452 subset evaluations, explicitly caching 27 repeated polygons, with no mismatch. These are finite implementation audits; the general result rests on the proof. Same-model agent review is not external expert or proof-assistant validation.

The supplied observation decoder explicitly stops on a retained branch with all α_i=0; it does not implement a general solver to distinguish infeasible from feasible-unbounded such branches. Executed α_i=1 fixtures avoid this limitation. The radius routine does report infinity for α_K=0.

The unresolved dependency is: valid conclusions after physical change or distribution shift ← physically guaranteed supports and fault budgets ← validated α,β,B,η ← the conditional radius and decoder established here. Only the last mathematical link has been closed. No physical calibration, coefficient-drift guarantee or finite-sample support coverage was established. Unrestricted UP-315 and UP-625 remain unsolved.

Next, set β_i=β̄_i+u_i with |u_i|≤ρ_i and attack the residual u_i b. Compute cross-threshold common-observation worlds under these coefficient bounds, comparing the outer approximation η_i+Bρ_i against a feasible set retaining the shared b. This was not executed here. Empirical validation of the bounds is a separate task.

## Sources

1. Stephen Boyd and Lieven Vandenberghe. *Convex Optimization*. Cambridge University Press, first published 2004; linked edition states seventh printing with corrections, 2009. Chapter 5, finite linear-program duality. [Author-hosted book](https://web.stanford.edu/~boyd/cvxbook/bv_cvxbook.pdf). Reviewed 2026-09-10. A current webpage generation date is not the date of this result.
2. M. Casini, A. Garulli and A. Vicino. *A linear programming approach to online set membership parameter estimation for linear regression models*. [Author-hosted manuscript](https://www3.diism.unisi.it/casini/pdf/IJACSP_2017a.pdf), especially §§1–2 on feasible parameter sets and coordinate bounds via LP. Publication date not verified from the retrieved manuscript; not inferred from its filename. Reviewed 2026-09-10. Its online approximation algorithm was not reproduced here.
3. [RC75 proof and constructive decoder](rc75-identification-proof.md), repository work dated 2026-09-10. Supplies the prior project's finite-support error/erasure argument, not external scientific verification.

Prior-art searches: “set membership estimation bounded errors minimax linear estimator optimal recovery polytope linear programming”; “convex optimization support function linear programming duality robust estimation bounded noise”. Existing frameworks were found. No novelty clearance, priority claim, newly resolved external problem, or prize eligibility is asserted.
