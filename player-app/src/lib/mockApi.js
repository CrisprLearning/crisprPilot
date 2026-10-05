// Local seed used until the Laravel backend is wired up. Mirrors the
// shape the real API will return so swapping is a one-line change in api.js.
//
// Keyed by screen_code. Add entries as needed for demos.

const SEED = {
  'KCH-R01': {
    screen: {
      id: 'scr-1', screen_code: 'KCH-R01', name: 'Reception TV',
      branch_id: 'br-kochi', branch_name: 'Kochi',
      resolution: '1920x1080', orientation: 'landscape', timezone: 'Asia/Kolkata',
    },
    loop: {
      id: 'tl-1', name: 'Morning Branding Loop', loop_enabled: true,
      items: [
        { id: 'i1', content_type: 'BRANDING',     duration_seconds: 8,  transition_type: 'fade',      data: { title: 'Crispr Learning', subtitle: 'India\'s most-loved JEE/NEET classroom', cta: 'Admissions open for 2026' } },
        { id: 'i2', content_type: 'ATTENDANCE',   duration_seconds: 10, transition_type: 'slide',     data: { present: 412, absent: 23, late: 8, total: 443 } },
        { id: 'i3', content_type: 'TOPPERS',      duration_seconds: 12, transition_type: 'cinematic', data: { entries: [
          { name: 'Aarav Mehta',     rank: 'AIR 12',  exam: 'JEE Advanced 2025', college: 'IIT Bombay' },
          { name: 'Diya Subramanian',rank: 'AIR 47',  exam: 'JEE Advanced 2025', college: 'IIT Madras' },
          { name: 'Karthik Rao',     rank: 'AIR 9',   exam: 'NEET 2025',         college: 'AIIMS Delhi' },
        ] } },
        { id: 'i4', content_type: 'COUNTDOWN',    duration_seconds: 8,  transition_type: 'zoom',      data: { title: 'JEE Main — Session 1', target: nextMonthIso() } },
        { id: 'i5', content_type: 'TESTIMONIALS', duration_seconds: 10, transition_type: 'slide',     data: { entries: [
          { name: 'Anjali R.',  quote: 'My daughter\'s ranks jumped from 80,000 to 12,000 in 8 months.', rating: 5 },
          { name: 'Mahesh P.',  quote: 'Mentors call us every Sunday. Nothing like this anywhere else.',  rating: 5 },
        ] } },
        { id: 'i6', content_type: 'POSTER',       duration_seconds: 7,  transition_type: 'fade',      data: { title: 'Foundation Batch — Class IX', subtitle: 'Early-bird seats closing 30 May', cta: 'Talk to a counsellor' } },
      ],
    },
    alerts: [],
  },

  'KCH-C01': {
    screen: { id: 'scr-2', screen_code: 'KCH-C01', name: 'Cafeteria', branch_id: 'br-kochi', branch_name: 'Kochi', resolution: '1920x1080', orientation: 'landscape', timezone: 'Asia/Kolkata' },
    loop: {
      id: 'tl-2', name: 'Cafeteria Loop', loop_enabled: true,
      items: [
        { id: 'c1', content_type: 'VIDEO',     duration_seconds: 15, transition_type: 'fade', data: { title: 'Campus Highlights' } },
        { id: 'c2', content_type: 'COUNTDOWN', duration_seconds: 8,  transition_type: 'zoom', data: { title: 'NEET 2026', target: nextMonthIso(60) } },
        { id: 'c3', content_type: 'POSTER',    duration_seconds: 8,  transition_type: 'slide',data: { title: 'New Lecture Hall is Live', subtitle: 'Block C, 4th Floor', cta: '' } },
      ],
    },
    alerts: [],
  },
};

function nextMonthIso(daysFromNow = 30) {
  const d = new Date(Date.now() + daysFromNow * 86400_000);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

export function mockFetchScreen(screenCode) {
  // Simulate network latency for realism
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const payload = SEED[screenCode];
      if (!payload) {
        reject(new Error(`Unknown screen code: ${screenCode}`));
      } else {
        resolve(structuredClone(payload));
      }
    }, 150);
  });
}

export function mockHeartbeat(screenCode) {
  return Promise.resolve({ ok: true, ts: Date.now(), screen_code: screenCode });
}

// Mock pairing — accepts any 6-digit code for any seeded screen.
export function mockPair(screen_code, _pairing_code) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const payload = SEED[screen_code];
      if (!payload) { reject(Object.assign(new Error('Unknown screen'), { code: 'not_found' })); return; }
      resolve({ screen_token: `mock:${screen_code}`, screen: payload.screen });
    }, 200);
  });
}
