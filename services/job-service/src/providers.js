function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function searchRemotive({ q, remote, limit }) {
  const url = new URL('https://remotive.com/api/remote-jobs');
  if (q) url.searchParams.set('search', q);
  url.searchParams.set('limit', String(Math.min(limit || 20, 50)));

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Remotive API error: ${res.status}`);
  }
  const data = await res.json();
  const jobs = (data.jobs || []).map((j) => ({
    id: `remotive:${j.id}`,
    title: j.title || 'Untitled',
    company: j.company_name || 'Unknown',
    location: j.candidate_required_location || 'Remote',
    description: stripHtml(j.description).slice(0, 4000),
    applyUrl: j.url || j.job_url || `https://remotive.com/remote-jobs/${j.id}`,
    source: 'remotive',
    externalId: String(j.id),
    postedAt: j.publication_date || undefined,
    salary: j.salary || undefined,
    tags: Array.isArray(j.tags) ? j.tags : [],
    remote: true,
  }));

  if (remote === false) {
    return jobs.filter((j) => !/remote/i.test(j.location));
  }
  return jobs;
}

async function searchAdzuna({ q, location, remote, page, limit }) {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  const country = process.env.ADZUNA_COUNTRY || 'us';

  if (!appId || !appKey) {
    return { jobs: [], skipped: true, reason: 'Adzuna credentials not configured' };
  }

  const pageNum = page || 1;
  const url = new URL(`https://api.adzuna.com/v1/api/jobs/${country}/search/${pageNum}`);
  url.searchParams.set('app_id', appId);
  url.searchParams.set('app_key', appKey);
  url.searchParams.set('results_per_page', String(Math.min(limit || 20, 50)));
  url.searchParams.set('what', q || 'software engineer');
  if (location) url.searchParams.set('where', location);
  if (remote) url.searchParams.set('what_and', 'remote');

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Adzuna API error: ${res.status} ${text}`);
  }
  const data = await res.json();
  const jobs = (data.results || []).map((j) => ({
    id: `adzuna:${j.id}`,
    title: j.title || 'Untitled',
    company: j.company?.display_name || 'Unknown',
    location: j.location?.display_name || '',
    description: stripHtml(j.description).slice(0, 4000),
    applyUrl: j.redirect_url || j.adref || '',
    source: 'adzuna',
    externalId: String(j.id),
    postedAt: j.created || undefined,
    salary:
      j.salary_min || j.salary_max
        ? `${j.salary_min || '?'} - ${j.salary_max || '?'} ${j.salary_currency || ''}`.trim()
        : undefined,
    tags: j.category?.label ? [j.category.label] : [],
    remote: /remote/i.test(`${j.title} ${j.description}`),
  }));

  return { jobs, skipped: false };
}

module.exports = { searchRemotive, searchAdzuna, stripHtml };
