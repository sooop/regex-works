export const BUILTIN_PRESETS = [
  {
    id: 'b-mobile', name: '휴대폰 번호', cat: '연락처',
    desc: '010·011 등 국내 휴대폰 번호. 하이픈은 있어도, 없어도 됩니다.',
    pattern: '01[016789]-?\\d{3,4}-?\\d{4}', flags: 'g', repl: '',
    samples: [
      { name: '연락처 메모', text: '김지수 010-1234-5678\n박민호 01098765432\n회사 대표번호 02-345-6789\n잘못된 번호 010-12-3456\n구형 번호 011-345-7890' }
    ],
    must: '010-1234-5678\n01098765432\n011-345-7890', mustnot: '010-12-3456\n02-345-6789\nabc', testMode: 'full'
  },
  {
    id: 'b-tel', name: '일반 전화번호', cat: '연락처',
    desc: '서울(02)과 지역번호(031~064) 전화번호.',
    pattern: '0(?:2|3[1-3]|4[1-4]|5[1-5]|6[1-4])-?\\d{3,4}-?\\d{4}', flags: 'g', repl: '',
    samples: [{ name: '지점 목록', text: '서울본점 02-345-6789\n수원지점 031-228-1234\n부산지점 051-740-5555\n제주지점 064-710-3030\n휴대폰 010-1234-5678' }],
    must: '02-345-6789\n031-228-1234\n0517405555', mustnot: '010-1234-5678\n099-123-4567', testMode: 'full'
  },
  {
    id: 'b-biz', name: '사업자등록번호', cat: '연락처',
    desc: '000-00-00000 형식의 10자리 번호.',
    pattern: '\\b\\d{3}-\\d{2}-\\d{5}\\b', flags: 'g', repl: '',
    samples: [{ name: '세금계산서', text: '공급자 사업자등록번호: 123-45-67890\n공급받는자: 220-81-62517\n주민번호 아님: 900101-1234567' }],
    must: '123-45-67890\n220-81-62517', mustnot: '12-345-67890\n123456789', testMode: 'search'
  },
  {
    id: 'b-zip', name: '우편번호(5자리)', cat: '연락처',
    desc: '새 우편번호 5자리. 앞뒤가 숫자인 경우는 제외합니다.',
    pattern: '(?<!\\d)\\d{5}(?!\\d)', flags: 'g', repl: '',
    samples: [{ name: '주소록', text: '서울 강남구 테헤란로 152 (06236)\n부산 해운대구 해운대로 264 48099\n주문번호 20261027001 은 제외' }],
    must: '06236\n48099', mustnot: '123456\n1234', testMode: 'full'
  },
  {
    id: 'b-hangul', name: '한글만', cat: '문자',
    desc: '처음부터 끝까지 완성형 한글로만 이루어진 문자열(이름 검증 등).',
    pattern: '^[가-힣]+$', flags: 'gm', repl: '',
    samples: [{ name: '이름 목록', text: '홍길동\nKim철수\n김 민지\n박서준\n이수빈2' }],
    must: '홍길동\n박서준', mustnot: 'Kim철수\n김 민지\n이수빈2', testMode: 'search'
  },
  {
    id: 'b-email', name: '이메일', cat: '문자',
    desc: '일반적인 이메일 주소. 엄밀한 RFC 검증은 아닙니다.',
    pattern: '[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+', flags: 'g', repl: '',
    samples: [{ name: '문의 메일', text: '문의: help@example.com 또는 sales.team+kr@my-shop.co.kr\n잘못된 주소: @missing.com, user@, a@b' }],
    must: 'help@example.com\nsales.team+kr@my-shop.co.kr', mustnot: '@missing.com\nuser@\na@b', testMode: 'full'
  },
  {
    id: 'b-url', name: 'URL', cat: '문자',
    desc: 'http 또는 https 로 시작하는 주소. 공백이나 닫는 괄호 앞에서 끊깁니다.',
    pattern: 'https?://[^\\s)>\\]]+', flags: 'g', repl: '',
    samples: [{ name: '게시글', text: '참고: https://docs.python.org/3/library/re.html 와 (https://developer.mozilla.org/ko/docs/Web/JavaScript/Guide/Regular_expressions) 를 보세요.\nftp://old.example.com 은 제외' }],
    must: 'https://example.com\nhttp://a.b/c?d=1', mustnot: 'ftp://example.com\nexample.com', testMode: 'full'
  },
  {
    id: 'b-date', name: '날짜 → 한글 표기', cat: '변환',
    desc: '2026-10-27, 2026.10.27, 2026/10/27 형식을 찾아 "2026년 10월 27일" 로 바꿉니다.',
    pattern: '(\\d{4})[-./](0[1-9]|1[0-2])[-./](0[1-9]|[12]\\d|3[01])', flags: 'g', repl: '$1년 $2월 $3일',
    samples: [{ name: '일정', text: '킥오프 2026-10-27\n마감 2026.12.31\n회고 2027/01/15\n잘못된 날짜 2026-13-40' }],
    must: '2026-10-27\n2026.12.31', mustnot: '2026-13-40\n20261027', testMode: 'full'
  },
  {
    id: 'b-comma', name: '숫자에 천 단위 콤마', cat: '변환',
    desc: '숫자 사이에 3자리마다 콤마를 넣습니다. 빈 일치(세로선)가 삽입 위치입니다.',
    pattern: '\\B(?=(?:\\d{3})+(?!\\d))', flags: 'g', repl: ',',
    samples: [{ name: '금액', text: '매출 1234567원\n비용 89000원\n순이익 1145567원\n작은 수 999' }],
    must: '', mustnot: '', testMode: 'search'
  },
  {
    id: 'b-money', name: '금액(원)', cat: '문자',
    desc: '콤마가 있거나 없는 금액 뒤에 "원"이 붙은 표현.',
    pattern: '\\d{1,3}(?:,\\d{3})+원|\\d+원', flags: 'g', repl: '',
    samples: [{ name: '영수증', text: '아메리카노 4,500원\n케이크 6500원\n합계 11,000원\n포인트 1,234,567원 적립\n수량 3개' }],
    must: '4,500원\n6500원\n1,234,567원', mustnot: '3개\n4,50원', testMode: 'full'
  },
  {
    id: 'b-space', name: '연속 공백 줄이기', cat: '변환',
    desc: '스페이스·탭이 2개 이상 이어진 곳을 공백 한 칸으로 바꿉니다.',
    pattern: '[ \\t]{2,}', flags: 'g', repl: ' ',
    samples: [{ name: '붙여넣은 문서', text: '이름    홍길동\n주소\t\t서울시   강남구\n메모  띄어쓰기가    들쭉날쭉' }],
    must: '', mustnot: '', testMode: 'search'
  },
  {
    id: 'b-trail', name: '줄 끝 공백 제거', cat: '변환',
    desc: '각 줄 끝에 남은 공백과 탭을 지웁니다.',
    pattern: '[ \\t]+$', flags: 'gm', repl: '',
    samples: [{ name: '코드 조각', text: 'const a = 1;   \nconst b = 2;\t\nconst c = 3;' }],
    must: '', mustnot: '', testMode: 'search'
  },
  {
    id: 'b-hash', name: '해시태그', cat: '문자',
    desc: '#으로 시작하는 한글·영문·숫자 태그.',
    pattern: '#[\\w가-힣]+', flags: 'g', repl: '',
    samples: [{ name: 'SNS 글', text: '오늘의 점심 #맛집 #서울맛집 후기\n가격은 #1 이 아니라 번호 # 3 은 제외\n#Regex2026 공부 중' }],
    must: '#맛집\n#Regex2026', mustnot: '# 3\n태그', testMode: 'full'
  },
  {
    id: 'b-ip', name: 'IPv4 주소', cat: '문자',
    desc: '0~255 범위를 지키는 IPv4 주소.',
    pattern: '\\b(?:(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\b', flags: 'g', repl: '',
    samples: [{ name: '접속 로그', text: '192.168.0.1 접속\n10.0.0.255 허용\n256.1.1.1 은 잘못된 주소\n8.8.8.8 DNS' }],
    must: '192.168.0.1\n8.8.8.8', mustnot: '256.1.1.1\n1.2.3', testMode: 'full'
  }
];
