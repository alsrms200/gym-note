// 운동 라이브러리와 기본 루틴. kind: w=중량×횟수, bw=맨몸(중량 선택), time=분 단위
const PARTS = ['가슴', '등', '어깨', '하체', '팔', '코어', '유산소'];
const EXERCISES = [
  ['bench', '벤치프레스', '가슴', '바벨'], ['incline-bench', '인클라인 벤치프레스', '가슴', '바벨'],
  ['db-press', '덤벨 프레스', '가슴', '덤벨'], ['incline-db', '인클라인 덤벨 프레스', '가슴', '덤벨'],
  ['chest-press', '체스트 프레스 머신', '가슴', '머신'], ['pec-fly', '펙덱 플라이', '가슴', '머신'],
  ['cable-cross', '케이블 크로스오버', '가슴', '케이블'], ['dips', '딥스', '가슴', '맨몸', 'bw'],
  ['pushup', '푸시업', '가슴', '맨몸', 'bw'],
  ['deadlift', '데드리프트', '등', '바벨'], ['pullup', '풀업', '등', '맨몸', 'bw'],
  ['lat-pull', '랫풀다운', '등', '케이블'], ['bb-row', '바벨 로우', '등', '바벨'],
  ['db-row', '원암 덤벨 로우', '등', '덤벨'], ['seated-row', '시티드 케이블 로우', '등', '케이블'],
  ['tbar-row', '티바 로우', '등', '바벨'], ['arm-pulldown', '암 풀다운', '등', '케이블'],
  ['back-ext', '백 익스텐션', '등', '맨몸', 'bw'],
  ['ohp', '오버헤드 프레스', '어깨', '바벨'], ['db-shoulder', '덤벨 숄더 프레스', '어깨', '덤벨'],
  ['shoulder-machine', '숄더 프레스 머신', '어깨', '머신'], ['lateral', '사이드 레터럴 레이즈', '어깨', '덤벨'],
  ['front-raise', '프론트 레이즈', '어깨', '덤벨'], ['rear-fly', '리어 델트 플라이', '어깨', '머신'],
  ['face-pull', '페이스 풀', '어깨', '케이블'], ['shrug', '슈러그', '어깨', '덤벨'],
  ['squat', '스쿼트', '하체', '바벨'], ['front-squat', '프론트 스쿼트', '하체', '바벨'],
  ['leg-press', '레그 프레스', '하체', '머신'], ['hack-squat', '핵 스쿼트', '하체', '머신'],
  ['lunge', '런지', '하체', '덤벨'], ['bulgarian', '불가리안 스플릿 스쿼트', '하체', '덤벨'],
  ['leg-ext', '레그 익스텐션', '하체', '머신'], ['leg-curl', '레그 컬', '하체', '머신'],
  ['rdl', '루마니안 데드리프트', '하체', '바벨'], ['hip-thrust', '힙 쓰러스트', '하체', '바벨'],
  ['calf', '카프 레이즈', '하체', '머신'], ['adductor', '이너 타이 (어덕터)', '하체', '머신'],
  ['bb-curl', '바벨 컬', '팔', '바벨'], ['db-curl', '덤벨 컬', '팔', '덤벨'],
  ['hammer', '해머 컬', '팔', '덤벨'], ['preacher', '프리처 컬', '팔', '머신'],
  ['pushdown', '케이블 푸시다운', '팔', '케이블'], ['oh-ext', '오버헤드 익스텐션', '팔', '덤벨'],
  ['skull', '라잉 트라이셉스 익스텐션', '팔', '바벨'], ['close-bench', '클로즈그립 벤치프레스', '팔', '바벨'],
  ['crunch', '크런치', '코어', '맨몸', 'bw'], ['leg-raise', '레그 레이즈', '코어', '맨몸', 'bw'],
  ['hanging-raise', '행잉 레그 레이즈', '코어', '맨몸', 'bw'], ['cable-crunch', '케이블 크런치', '코어', '케이블'],
  ['plank', '플랭크', '코어', '맨몸', 'time'], ['ab-wheel', '앱 휠 롤아웃', '코어', '맨몸', 'bw'],
  ['treadmill', '러닝머신', '유산소', '머신', 'time'], ['cycle', '사이클', '유산소', '머신', 'time'],
  ['stair', '스텝밀 (천국의 계단)', '유산소', '머신', 'time'], ['rowing', '로잉 머신', '유산소', '머신', 'time'],
].map(([id, name, part, equip, kind]) => ({ id, name, part, equip, kind: kind || 'w' }));

const it = (exId, sets, reps, rest) => ({ exId, sets, reps, rest, weight: 0 });
const PRESET_ROUTINES = [
  { id: 'p-push', name: '밀기 (가슴·어깨·삼두)', items: [it('bench', 4, 8, 120), it('incline-db', 3, 10, 90), it('db-shoulder', 3, 10, 90), it('lateral', 4, 15, 60), it('pushdown', 3, 12, 60)] },
  { id: 'p-pull', name: '당기기 (등·이두)', items: [it('lat-pull', 4, 10, 90), it('bb-row', 4, 8, 120), it('seated-row', 3, 12, 90), it('face-pull', 3, 15, 60), it('db-curl', 3, 12, 60)] },
  { id: 'p-legs', name: '하체', items: [it('squat', 4, 8, 150), it('leg-press', 3, 12, 120), it('rdl', 3, 10, 120), it('leg-ext', 3, 15, 60), it('leg-curl', 3, 15, 60), it('calf', 3, 15, 45)] },
  { id: 'p-full', name: '전신 (시간 없는 날)', items: [it('squat', 3, 8, 120), it('bench', 3, 8, 120), it('lat-pull', 3, 10, 90), it('db-shoulder', 3, 10, 90), it('plank', 3, 1, 45)] },
];
