export type Release = {
    version: string
    date: string
    changes: string[]
}

// Reads CHANGELOG.md | a release is a `## X.Y.Z · YYYY-MM-DD` heading with bullets below
export function parseChangelog(text: string): Release[] {
    const releases: Release[] = []

    for(const line of text.split(/\r?\n/)){
        const heading = line.match(/^##\s+(\S+)\s*·\s*(\S+)/)
        if(heading){
            releases.push({ version: heading[1], date: heading[2], changes: [] })
            continue
        }

        const bullet = line.match(/^[-*]\s+(.+)/)
        if(bullet && releases.length) releases.at(-1)!.changes.push(bullet[1].trim())
    }

    return releases
}
