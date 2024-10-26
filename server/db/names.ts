import { join } from "path";
import { readFileSync } from "fs";
import { db } from "@server/db";
import { sites } from "./schema";
import { eq, and } from "drizzle-orm";
import { __DIRNAME } from "@server/config";

// Load the names from the names.json file
const file = join(__DIRNAME, "names.json");
export const names = JSON.parse(readFileSync(file, "utf-8"));

export async function getUniqueName(orgId: string): Promise<string> {
    let loops = 0;
    while (true) {
        if (loops > 100) {
            throw new Error("Could not generate a unique name");
        }

        const name = generateName();
        const count = await db
            .select({ niceId: sites.niceId, orgId: sites.orgId })
            .from(sites)
            .where(and(eq(sites.niceId, name), eq(sites.orgId, orgId)));
        if (count.length === 0) {
            return name;
        }
        loops++;
    }
}

export function generateName(): string {
    return (
        names.descriptors[
            Math.floor(Math.random() * names.descriptors.length)
        ] +
        "-" +
        names.animals[Math.floor(Math.random() * names.animals.length)]
    )
        .toLowerCase()
        .replace(/\s/g, "-");
}
