// Print saved frame measurements, including repeated cases and scroll traces.
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
const summary = process.argv.includes("--summary");
if (!dir)
    throw new Error("Usage: motion-report.mjs ARTIFACTS [--summary]");
const files = fs
    .readdirSync(dir)
    .filter(
        (name) =>
            /^(?:case|native)-\d+(?:-.+)?\.json$/.test(name) ||
            /^(overlay|overlay-trace|settings|settings-preopen)\.json$/.test(
                name,
            ),
    )
    .sort();
if (!files.length) throw new Error("No case reports in " + dir);
for (const file of files) {
    const report = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    console.log(
        file +
            " viewport=" +
            report.viewport +
            " errors=" +
            JSON.stringify(report.errors),
    );
    if (report.events) {
        console.log(
            JSON.stringify(
                {
                    before: report.before,
                    sync: report.sync,
                    micro: report.micro,
                    raf1: report.raf1,
                },
                null,
                2,
            ),
        );
        if (!summary)
            for (const event of report.events)
                console.log(JSON.stringify(event));
    }
    for (const transition of report.transitions ?? []) {
        const frames = transition.frames;
        const first = frames[0];
        const last = frames.at(-1);
        const fields = [
            "height",
            "listHeight",
            "scrollTop",
            "preview",
            "section",
            "chevronRotate",
        ].filter((key) => first[key] !== undefined || last[key] !== undefined);
        console.log(
            transition.label +
                ": " +
                fields
                    .map((key) => key + " " + first[key] + " → " + last[key])
                    .join(", "),
        );
        if (
            transition.label.startsWith("close-scrolled") &&
            first.scrollHeight !== undefined
        ) {
            const deviation = Math.max(
                ...frames.map((sample) =>
                    Math.abs(
                        sample.scrollTop -
                            Math.min(
                                first.scrollTop,
                                Math.max(
                                    0,
                                    sample.scrollHeight - sample.clientHeight,
                                ),
                            ),
                    ),
                ),
            );
            console.log(
                "  " +
                    frames.length +
                    " frames; maximum scroll deviation=" +
                    deviation,
            );
        }
        if (!summary) {
            for (const sample of frames.filter(
                (_, index) => index % 2 === 0 || index === frames.length - 1,
            )) {
                const values = Object.fromEntries(
                    [
                        "ms",
                        ...fields,
                        "animationName",
                        "duration",
                        "hidden",
                        "expanded",
                    ]
                        .filter((key) => sample[key] !== undefined)
                        .map((key) => [key, sample[key]]),
                );
                console.log("  " + JSON.stringify(values));
            }
        }
    }
}
