import axios from 'axios';
import { getInstitutionalFlowSummary } from '../institutionalFlowService';
import { RawNewsItem } from './types';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

const DEFAULT_HEADERS = {
    'User-Agent': USER_AGENT,
    'Accept-Language': 'en-US,en;q=0.9',
};

function nowIso(): string {
    return new Date().toISOString();
}

function decodeHtml(value: string): string {
    return value
        .replace(/<!\[CDATA\[/g, '')
        .replace(/\]\]>/g, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();
}

function detectLanguage(text: string): string {
    if (/[\u0900-\u097F]/.test(text)) return 'hi';
    return 'en';
}

function toIsoDate(value: string | null | undefined): string | null {
    const raw = decodeHtml(value || '');
    if (!raw) return null;
    const direct = new Date(raw);
    if (!Number.isNaN(direct.getTime())) return direct.toISOString();

    const match = raw.match(/^(\d{1,2})[-/ ]([A-Za-z]{3,9})[-/ ,]+(\d{2,4})$/);
    if (match) {
        const [, dayRaw, monthRaw, yearRaw] = match;
        const monthMap = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        const monthIndex = monthMap.indexOf(monthRaw.slice(0, 3).toLowerCase());
        const year = Number(yearRaw.length === 2 ? `20${yearRaw}` : yearRaw);
        if (monthIndex >= 0) {
            return new Date(Date.UTC(year, monthIndex, Number(dayRaw))).toISOString();
        }
    }

    return raw;
}

function summarizeBody(body: string): string {
    return body.length <= 280 ? body : `${body.slice(0, 277).trim()}...`;
}

function buildItem(partial: Omit<RawNewsItem, 'fetchedAt' | 'language' | 'summary'> & { language?: string; summary?: string }): RawNewsItem {
    const body = decodeHtml(partial.body || partial.title || '');
    return {
        ...partial,
        body,
        summary: partial.summary ? decodeHtml(partial.summary) : summarizeBody(body),
        language: partial.language || detectLanguage(`${partial.title} ${body}`),
        publishedAt: toIsoDate(partial.publishedAt),
        fetchedAt: nowIso(),
    };
}

async function fetchText(url: string, accept = 'text/html,application/xhtml+xml,application/xml,text/xml,*/*', extraHeaders: Record<string, string> = {}): Promise<string> {
    const { data } = await axios.get<string>(url, {
        timeout: 15000,
        headers: {
            ...DEFAULT_HEADERS,
            'Accept': accept,
            ...extraHeaders,
        },
        responseType: 'text',
        validateStatus: status => status >= 200 && status < 400,
    });
    return typeof data === 'string' ? data : String(data ?? '');
}

function parseRssItems(xml: string, source: string, sourceType: RawNewsItem['sourceType'], trustScore: number, limit = 10): RawNewsItem[] {
    const chunks = xml.split('<item>').slice(1);
    return chunks.slice(0, limit).map(chunk => {
        const itemContent = chunk.split('</item>')[0];
        const extract = (tag: string) => {
            const match = itemContent.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
            return decodeHtml(match?.[1] || '');
        };
        return buildItem({
            title: extract('title'),
            body: extract('description') || extract('title'),
            url: extract('link'),
            source,
            sourceType,
            publishedAt: extract('pubDate') || null,
            trustScore,
        });
    }).filter(item => item.title && item.url);
}

async function fetchRss(url: string, source: string, sourceType: RawNewsItem['sourceType'], trustScore: number, limit = 10): Promise<RawNewsItem[]> {
    const data = await fetchText(url, 'application/rss+xml, application/xml, text/xml, text/plain, */*');
    return parseRssItems(data, source, sourceType, trustScore, limit);
}

function parseHtmlAnchors(
    html: string,
    source: string,
    sourceType: RawNewsItem['sourceType'],
    trustScore: number,
    hostPrefix: string,
    titlePattern: RegExp,
    limit = 10
): RawNewsItem[] {
    const seen = new Set<string>();
    const items: RawNewsItem[] = [];
    let match: RegExpExecArray | null;

    while ((match = titlePattern.exec(html)) !== null && items.length < limit) {
        const href = decodeHtml(match[1] || '');
        const title = decodeHtml(match[2] || '');
        if (!href || !title || seen.has(href)) continue;
        seen.add(href);
        const url = href.startsWith('http') ? href : `${hostPrefix}${href.startsWith('/') ? '' : '/'}${href}`;
        items.push(buildItem({
            title,
            body: title,
            url,
            source,
            sourceType,
            publishedAt: null,
            trustScore,
        }));
    }

    return items;
}

function parseHtmlTableRows(
    html: string,
    source: string,
    sourceType: RawNewsItem['sourceType'],
    trustScore: number,
    hostPrefix: string,
    limit = 10
): RawNewsItem[] {
    const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    const items: RawNewsItem[] = [];

    for (const row of rows) {
        if (items.length >= limit) break;
        const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(match => decodeHtml(match[1] || ''));
        const linkMatch = row.match(/href="([^"]+)"/i);
        const title = cells.find(cell => cell.length > 20) || '';
        if (!title) continue;

        items.push(buildItem({
            title,
            body: cells.join(' | '),
            url: linkMatch
                ? (linkMatch[1].startsWith('http') ? linkMatch[1] : `${hostPrefix}${linkMatch[1].startsWith('/') ? '' : '/'}${linkMatch[1]}`)
                : hostPrefix,
            source,
            sourceType,
            publishedAt: cells.find(cell => /\d{1,2}[-/ ][A-Za-z]{3,9}[-/ ]\d{2,4}|\d{4}-\d{2}-\d{2}/.test(cell)) || null,
            trustScore,
        }));
    }

    return items;
}

function googleNewsSearchUrl(query: string): string {
    return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
}

async function fetchSebiOfficialSource(): Promise<RawNewsItem[]> {
    const directFeedUrl = 'https://www.sebi.gov.in/sebirss.xml';
    try {
        return await fetchRss(directFeedUrl, 'SEBI RSS', 'REGULATORY', 0.95, 12);
    } catch {
        const html = await fetchText('https://www.sebi.gov.in/');
        return parseHtmlAnchors(
            html,
            'SEBI Website',
            'REGULATORY',
            0.92,
            'https://www.sebi.gov.in',
            /href="([^"]+)"[^>]*>([^<]*(?:press release|order|notice|circular|adjudication)[^<]*)</gi,
            12
        );
    }
}

async function fetchRbiOfficialSources(): Promise<RawNewsItem[]> {
    const candidates = [
        { url: 'https://www.rbi.org.in/scripts/RSS.aspx?Id=17', source: 'RBI Press Releases', trust: 0.94 },
        { url: 'https://www.rbi.org.in/scripts/RSS.aspx?Id=18', source: 'RBI Notifications', trust: 0.94 },
    ];

    const settled = await Promise.allSettled(candidates.map(async candidate =>
        fetchRss(candidate.url, candidate.source, 'REGULATORY', candidate.trust, 10)
    ));

    const items = settled.flatMap(result => result.status === 'fulfilled' ? result.value : []);
    if (items.length) return items;

    const html = await fetchText('https://www.rbi.org.in/scripts/rss.aspx');
    return parseHtmlAnchors(
        html,
        'RBI RSS Directory',
        'REGULATORY',
        0.92,
        'https://www.rbi.org.in',
        /href="([^"]+)"[^>]*>([^<]*(?:Press Releases|Notifications|Speeches)[^<]*)</gi,
        8
    );
}

async function fetchNseExchangeSources(): Promise<RawNewsItem[]> {
    const filingsUrl = 'https://www.nseindia.com/companies-listing/corporate-filings-announcements';
    const html = await fetchText(filingsUrl, 'text/html,application/xhtml+xml,*/*', {
        'Referer': 'https://www.nseindia.com/',
    });

    const tableItems = parseHtmlTableRows(
        html,
        'NSE Corporate Filings',
        'EXCHANGE',
        0.97,
        'https://www.nseindia.com',
        14
    );

    const anchorItems = parseHtmlAnchors(
        html,
        'NSE Exchange Communication',
        'EXCHANGE',
        0.94,
        'https://www.nseindia.com',
        /href="([^"]+)"[^>]*>([^<]*(?:announcement|filing|results|board meeting|press release|circular)[^<]*)</gi,
        12
    );

    return [...tableItems, ...anchorItems];
}

async function fetchBseExchangeSources(): Promise<RawNewsItem[]> {
    const settled = await Promise.allSettled([
        fetchText('https://www.bseindia.com/markets/equity/EQReports/BulknBlockDeals.aspx'),
        fetchText('https://www.bseindia.com/corporates/ann.html').catch(() => ''),
        fetchText('https://www.bseindia.com/rss-feed.html').catch(() => ''),
    ]);

    const items: RawNewsItem[] = [];
    const bulkHtml = settled[0].status === 'fulfilled' ? settled[0].value : '';
    if (bulkHtml) {
        items.push(...parseHtmlTableRows(
            bulkHtml,
            'BSE Bulk/Block Deals',
            'MARKET_DATA',
            0.93,
            'https://www.bseindia.com',
            10
        ));
    }

    const corpHtml = settled[1].status === 'fulfilled' ? settled[1].value : '';
    if (corpHtml) {
        items.push(...parseHtmlAnchors(
            corpHtml,
            'BSE Corporate Announcements',
            'EXCHANGE',
            0.95,
            'https://www.bseindia.com',
            /href="([^"]+)"[^>]*>([^<]*(?:announcement|board meeting|results|record date|dividend|buyback)[^<]*)</gi,
            10
        ));
    }

    const rssDirectoryHtml = settled[2].status === 'fulfilled' ? settled[2].value : '';
    if (rssDirectoryHtml) {
        const feedLinks = [...rssDirectoryHtml.matchAll(/href="([^"]+\.xml[^"]*)"/gi)].map(match => match[1]);
        const feedSettled = await Promise.allSettled(feedLinks.slice(0, 4).map(link =>
            fetchRss(link.startsWith('http') ? link : `https://www.bseindia.com${link}`, 'BSE RSS', 'EXCHANGE', 0.94, 8)
        ));
        items.push(...feedSettled.flatMap(result => result.status === 'fulfilled' ? result.value : []));
    }

    return items;
}

async function fetchMoneycontrolSources(): Promise<RawNewsItem[]> {
    const settled = await Promise.allSettled([
        fetchText('https://www.moneycontrol.com/features/rss/news/business/stocks/'),
        fetchText('https://www.moneycontrol.com/features/rss/news/business/markets/').catch(() => ''),
    ]);

    return settled.flatMap(result => {
        if (result.status !== 'fulfilled') return [];
        return parseHtmlAnchors(
            result.value,
            'Moneycontrol',
            'MEDIA',
            0.68,
            'https://www.moneycontrol.com',
            /href="([^"]+)"[^>]*>([^<]{30,200})</gi,
            12
        );
    });
}

async function fetchGoogleContextSources(): Promise<RawNewsItem[]> {
    const settled = await Promise.allSettled([
        fetchRss(googleNewsSearchUrl('Indian stock market NSE BSE SEBI RBI'), 'Google News Market', 'MEDIA', 0.58, 12),
        fetchRss(googleNewsSearchUrl('SEBI RBI Indian market regulation'), 'Google News Regulation', 'REGULATORY', 0.64, 10),
        fetchRss(googleNewsSearchUrl('bulk deal block deal Indian market'), 'Google News Deals', 'MARKET_DATA', 0.58, 8),
    ]);

    return settled.flatMap(result => result.status === 'fulfilled' ? result.value : []);
}

async function fetchInstitutionalFlowSyntheticSource(): Promise<RawNewsItem[]> {
    try {
        const summary = await getInstitutionalFlowSummary();
        if (!summary.latest) return [];

        const latest = summary.latest;
        return [
            buildItem({
                title: `FII/DII flow update: total net ${latest.totalNet >= 0 ? 'buying' : 'selling'} of ${Math.abs(latest.totalNet).toFixed(0)} Cr`,
                body: summary.trend.detail,
                url: 'https://www.nseindia.com/reports/fii-dii',
                source: 'NSE FII/DII Official Report',
                sourceType: 'MARKET_DATA',
                publishedAt: latest.tradingDate,
                trustScore: 0.99,
            }),
        ];
    } catch {
        return [];
    }
}

export async function fetchBaseNewsSources(): Promise<RawNewsItem[]> {
    const settled = await Promise.allSettled([
        fetchSebiOfficialSource(),
        fetchRbiOfficialSources(),
        fetchNseExchangeSources(),
        fetchBseExchangeSources(),
        fetchMoneycontrolSources(),
        fetchRss('https://www.livemint.com/rss/markets', 'LiveMint Markets', 'MEDIA', 0.72, 12),
        fetchRss('https://www.livemint.com/rss/companies', 'LiveMint Companies', 'MEDIA', 0.72, 12),
        fetchGoogleContextSources(),
        fetchInstitutionalFlowSyntheticSource(),
    ]);

    return settled.flatMap(result => result.status === 'fulfilled' ? result.value : []);
}

export async function fetchTickerNewsSource(ticker: string): Promise<RawNewsItem[]> {
    const settled = await Promise.allSettled([
        fetchRss(googleNewsSearchUrl(`${ticker} NSE stock`), `Google News ${ticker}`, 'MEDIA', 0.6, 12),
        fetchRss(googleNewsSearchUrl(`${ticker} company results guidance order win`), `Google News ${ticker} Company`, 'MEDIA', 0.6, 8),
        fetchRss(googleNewsSearchUrl(`${ticker} sebi rbi order pledge results`), `Google News ${ticker} Regulation`, 'REGULATORY', 0.62, 8),
    ]);

    const googleItems = settled.flatMap(result => result.status === 'fulfilled' ? result.value : []);
    const moneycontrolHtml = await fetchText(`https://www.moneycontrol.com/news/tags/${ticker.toLowerCase()}.html`).catch(() => '');
    const moneycontrolItems = moneycontrolHtml
        ? parseHtmlAnchors(
            moneycontrolHtml,
            `Moneycontrol ${ticker}`,
            'MEDIA',
            0.68,
            'https://www.moneycontrol.com',
            /href="([^"]+)"[^>]*>([^<]{30,220})</gi,
            10
        )
        : [];

    return [...googleItems, ...moneycontrolItems];
}
