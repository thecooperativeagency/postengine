import { pool } from './connection.js';

async function seedDatabase() {
  const investors = [
    {
      name: 'Chris Camillo',
      bio: 'Retail investor, social arbitrage specialist. Turned $84K into $42M using trend spotting.',
      handle_x: 'chriscamillo',
      handle_tiktok: 'chriscamillo',
      handle_instagram: null,
      channel_youtube: null,
      website_url: 'https://tickertags.com',
    },
    {
      name: 'Keith Gill',
      bio: 'Roaring Kitty. GME activist, retail sentiment pioneer.',
      handle_x: 'TheRoaringKitty',
      handle_tiktok: null,
      handle_instagram: null,
      channel_youtube: null,
      website_url: null,
    },
    {
      name: 'Cathie Wood',
      bio: 'ARK Invest CEO. Disruptive innovation focused investing.',
      handle_x: 'CathieWood',
      handle_tiktok: null,
      handle_instagram: null,
      channel_youtube: null,
      cik_sec: '0001616707',
      website_url: 'https://www.arkfunds.com',
    },
    {
      name: 'Mark Minervini',
      bio: 'Technical analysis and trend-following mentor.',
      handle_x: 'MarkMinervini',
      handle_tiktok: null,
      handle_instagram: null,
      channel_youtube: 'markminervini',
      website_url: 'https://www.minervini.com',
    },
    {
      name: 'Peter Lynch (Archive)',
      bio: 'Legendary value investor. Historical reference.',
      handle_x: null,
      handle_tiktok: null,
      handle_instagram: null,
      channel_youtube: null,
      website_url: null,
    },
  ];

  try {
    console.log('Seeding investors...');

    for (const investor of investors) {
      const query = `
        INSERT INTO investors 
        (name, bio, handle_x, handle_tiktok, handle_instagram, channel_youtube, website_url, cik_sec, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
        ON CONFLICT (name) DO NOTHING
        RETURNING id, name;
      `;

      const result = await pool.query(query, [
        investor.name,
        investor.bio,
        investor.handle_x,
        investor.handle_tiktok,
        investor.handle_instagram,
        investor.channel_youtube,
        investor.website_url,
        investor.cik_sec,
      ]);

      if (result.rows.length > 0) {
        console.log(`✅ Added investor: ${result.rows[0].name}`);
      } else {
        console.log(`⏭️  Investor already exists: ${investor.name}`);
      }
    }

    console.log('Seed completed successfully');
  } catch (error) {
    console.error('Seed error:', error);
  } finally {
    await pool.end();
  }
}

seedDatabase();
