import fs from 'fs';
import { backupNotes, CACHE_PATH, ENTRIES_PATH, getDomainAndPath, runningEvents, } from './const.mjs';
import { JSDOM } from 'jsdom';
const resultsLinks = {
    doha: 'https://web.archive.org/web/20220512074007/https://doha.diamondleague.com/programme-results-doha/',
    birminghamIndoor: 'https://results-json.microplustimingservices.com/export/WAITF2023/ScheduleByDate_1.JSON',
    ncaai23: 'https://flashresults.ncaa.com/Indoor/2023/index.htm',
    boston23: 'N/A',
};
const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
const entries = JSON.parse(fs.readFileSync(ENTRIES_PATH, 'utf-8'));
const findMatchingEvt = (meetEntries, evt) => {
    return Object.keys(meetEntries).find((entriesEvt) => runningEvents.find((group) => group.includes(entriesEvt)).includes(evt));
};
for (const key in resultsLinks) {
    const meet = key;
    if (meet !== 'boston23')
        continue;
    if (meet + '' === 'boston23') {
        entries[meet]["Men's Marathon"].results = [
            '14483236',
            '14677692',
            '14758213',
            '14645745',
            '14577963',
            '14208194',
            '14452474',
            '14183770',
            '14845463',
            '14470801',
        ].map((id, i) => ({
            place: i + 1,
            mark: '',
            notes: '',
            entrant: entries[meet]["Men's Marathon"]?.entrants.find((ent) => ent.id === id),
        }));
        entries[meet]["Women's Marathon"].results = [
            '14424921',
            '14664871',
            '14523502',
            '14465270',
            '14453636',
            '14262207',
            '14423894',
            '14534424',
            '14289475',
            '14477379',
        ].map((id, i) => ({
            place: i + 1,
            mark: '',
            notes: '',
            entrant: entries[meet]["Women's Marathon"]?.entrants.find((ent) => ent.id === id),
        }));
        continue;
    }
    cache[meet] ??= { schedule: {}, events: {}, ids: {} };
    if (resultsLinks[meet].includes('flashresults')) {
        cache[meet].resultsSchedule ??= await (await fetch(resultsLinks[meet])).text();
        const { document } = new JSDOM(cache[meet].resultsSchedule).window;
        const rows = document.querySelectorAll('tbody > tr');
        const runningFinals = [...rows]
            .filter((tr) => runningEvents.flat().includes(tr.querySelector('td.fixed-column')?.textContent) &&
            tr.querySelectorAll('td')[4].textContent?.startsWith('Final'))
            .map((tr) => ({
            evt: findMatchingEvt(entries[meet], tr.querySelector('td.fixed-column')?.textContent),
            link: getDomainAndPath(resultsLinks[meet]) +
                [...tr.querySelectorAll('td')]
                    .find((td) => td.textContent?.trim() === 'Result') // TODO change to 'Result'
                    .querySelector('a')?.href,
        }));
        for (const { evt, link } of runningFinals) {
            console.log(evt, link);
            const { document } = new JSDOM(await (await fetch(link)).text()).window;
            const resultRows = document.querySelectorAll('table.table-striped > tbody > tr');
            const results = [...resultRows].map((tr) => {
                const mark = tr.querySelectorAll('td')[3].textContent?.trim().split(' ')[0];
                let notes = [...tr.querySelectorAll('td')].at(-1)?.textContent?.trim() ?? '';
                if (backupNotes.some((bn) => mark.includes(bn)))
                    notes += mark;
                return {
                    entrant: entries[meet][evt]?.entrants.find((ent) => `${ent.firstName} ${ent.lastName.toUpperCase()}` ===
                        tr.querySelectorAll('td')[2].querySelector('a').textContent?.trim()),
                    place: +tr.querySelectorAll('td')[0].textContent?.trim(),
                    mark,
                    notes,
                };
            });
            if (!results.length || results.every((res) => !res.mark))
                entries[meet][evt].results = undefined;
            else
                entries[meet][evt].results = results;
        }
        continue;
    }
    const meetCode = resultsLinks[meet].match(/^https:\/\/results-json\.microplustimingservices\.com\/export\/(.*)\//)[1];
    cache[meet].resultsSchedule ??= await (await fetch(resultsLinks[meet])).text();
    const resultsSchedule = JSON.parse(cache[meet].resultsSchedule);
    for (const { c0, c1, c2, c3, tab, d1_en, d3_en, d_en } of resultsSchedule.e) {
        const evt = `${d3_en}'s ${d_en}`;
        if (!entries[meet][evt])
            continue;
        if (d1_en !== 'Final')
            continue;
        const resultCode = tab.find((t) => t.p_en === 'Result')?.nf;
        cache[meet].events[evt] ??= {};
        cache[meet].events[evt].results ??= await (await fetch(`https://results-json.microplustimingservices.com/export/${meetCode}/AT${c0}${c1}${resultCode}${String(+c2).padStart(2, '0')}%20${c3}.JSON`)).text();
        const evtResults = JSON.parse(cache[meet].events[evt].results);
        entries[meet][evt].results = evtResults.data.map((dat) => {
            return {
                mark: dat.MemPrest,
                place: +dat.PlaCls,
                notes: dat.MemNote,
                entrant: entries[meet][evt]?.entrants.find((ent) => `${ent.firstName} ${ent.lastName.toUpperCase()}` ===
                    `${dat.PlaName} ${dat.PlaSurname}`),
            };
        });
    }
}
fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
fs.writeFileSync(ENTRIES_PATH, JSON.stringify(entries, null, 2));
