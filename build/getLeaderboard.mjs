// ssh habs@ma.sdf.org "sqlite3 -header -csv ~/db/fantasy1500.db \"select * from picks where meet = 'boston23';\"" > picks.csv
// ssh habs@ma.sdf.org 'sqlite3 -header -csv ~/db/fantasy1500.db "select * from users;"' > users.csv
import fs from 'fs';
import { backupNotes, CACHE_PATH, disciplineCodes, distanceEvents, ENTRIES_PATH, LB_PATH, SCORE, sprintEvents, } from './const.mjs';
import { parse } from 'csv-parse/sync';
const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
const entries = JSON.parse(fs.readFileSync(ENTRIES_PATH, 'utf-8'));
const leaderboard = JSON.parse(fs.readFileSync(LB_PATH, 'utf-8'));
const rows = parse(fs.readFileSync('./picks.csv', 'utf-8'), {
    columns: true,
});
const users = parse(fs.readFileSync('./users.csv', 'utf-8'), {
    columns: true,
});
const getScore = (meet, team, evt) => {
    let score = 0;
    const backup = team[evt]?.at(-1);
    const backupResult = (entries[meet][evt].results ?? []).find((res) => res.entrant?.id === backup?.id) ?? { notes: 'DNS' };
    let doneBackup = false;
    if (backupNotes.some((note) => backupResult.notes.includes(note)))
        doneBackup = true;
    const scorers = {};
    for (const pick of team[evt].slice(0, -1)) {
        console.log(entries, meet, evt, Object.keys(entries[meet][evt]));
        let matchingResult = (entries[meet][evt].results ?? []).find((res) => res.entrant?.id === pick?.id);
        if (backupNotes.some((note) => matchingResult?.notes.includes(note)) && !doneBackup) {
            matchingResult = backupResult;
            doneBackup = true;
        }
        const index = team[evt]?.indexOf(pick);
        const isCaptain = pick === team[evt][0];
        const pickScore = SCORE[matchingResult?.place - 1] * (10 - index > 0 ? 10 - index : 0) || 0;
        console.log(evt, pick.firstName, pick.lastName, matchingResult?.place, pickScore);
        scorers[matchingResult?.entrant.id] = pickScore;
        score += pickScore;
    }
    if (Number.isNaN(score))
        process.exit();
    return { score, scorers };
};
const fixIds = (picks) => {
    for (const key in picks) {
        const evt = key;
        for (const pick of picks[evt]) {
            pick.id = JSON.parse([...rows]
                .reverse()
                .find(({ picksJson }) => JSON.parse(picksJson)[evt].find((ath) => `${ath.firstName} ${ath.lastName}` === `${pick.firstName} ${pick.lastName}`))?.picksJson)[evt].find((ath) => `${ath.firstName} ${ath.lastName}` === `${pick.firstName} ${pick.lastName}`).id;
        }
    }
};
const evtToGenderedCode = (evt) => (evt[0] + disciplineCodes[evt.split(' ').slice(1).join(' ')]);
for (const meet of ['boston23']) {
    leaderboard[meet] = [];
    for (const { picksJson, userid } of rows) {
        const picks = JSON.parse(picksJson);
        fixIds(picks); // TODO remove in future
        const userPicks = Object.keys(picks).reduce((acc, evt) => {
            const evtCode = evtToGenderedCode(evt);
            acc[evtCode] = { team: picks[evt].map(({ id }) => id) };
            return acc;
        }, {});
        let distanceScore = 0;
        let sprintScore = 0;
        let eventsScored = 0;
        for (const key in picks) {
            const evt = key;
            if (!entries[meet]?.[evt]?.results)
                continue;
            const { score: evtScore, scorers } = getScore(meet, picks, evt);
            userPicks[evtToGenderedCode(evt)].scorers = scorers;
            if (distanceEvents.includes(evt))
                distanceScore += evtScore;
            if (sprintEvents.includes(evt))
                sprintScore += evtScore;
            eventsScored++;
        }
        const score = distanceScore + sprintScore;
        leaderboard[meet].push({
            userid,
            name: users.find(({ id }) => id === userid).name,
            picks: userPicks,
            distanceScore,
            sprintScore,
            eventsScored,
            score,
        });
        console.log(leaderboard[meet].at(-1));
    }
    leaderboard[meet]?.sort((a, b) => b.score - a.score);
}
fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
fs.writeFileSync(ENTRIES_PATH, JSON.stringify(entries, null, 2));
fs.writeFileSync(LB_PATH, JSON.stringify(leaderboard));
