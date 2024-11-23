import { Request, Response, NextFunction } from "express";
import { db } from "@server/db";
import { exitNodes, sites } from "@server/db/schema";
import { eq } from "drizzle-orm";
import response from "@server/utils/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { findNextAvailableCidr } from "@server/utils/ip";
import { generateId } from "@server/auth";

export type PickSiteDefaultsResponse = {
    exitNodeId: number;
    address: string;
    publicKey: string;
    name: string;
    listenPort: number;
    endpoint: string;
    subnet: string;
    newtId: string;
    newtSecret: string;
};

export async function pickSiteDefaults(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        // TODO: more intelligent way to pick the exit node

        // make sure there is an exit node by counting the exit nodes table
        const nodes = await db.select().from(exitNodes);
        if (nodes.length === 0) {
            return next(
                createHttpError(HttpCode.NOT_FOUND, "No exit nodes available")
            );
        }

        // get the first exit node
        const exitNode = nodes[0];

        // TODO: this probably can be optimized...
        // list all of the sites on that exit node
        const sitesQuery = await db
            .select({
                subnet: sites.subnet,
            })
            .from(sites)
            .where(eq(sites.exitNodeId, exitNode.exitNodeId));

        // TODO: we need to lock this subnet for some time so someone else does not take it
        let subnets = sitesQuery.map((site) => site.subnet);
        // exclude the exit node address by replacing after the / with a /28
        subnets.push(exitNode.address.replace(/\/\d+$/, "/29"));
        const newSubnet = findNextAvailableCidr(subnets, 29, exitNode.address);
        if (!newSubnet) {
            return next(
                createHttpError(
                    HttpCode.INTERNAL_SERVER_ERROR,
                    "No available subnets"
                )
            );
        }

        const newtId = generateId(15);
        const secret = generateId(48);

        return response<PickSiteDefaultsResponse>(res, {
            data: {
                exitNodeId: exitNode.exitNodeId,
                address: exitNode.address,
                publicKey: exitNode.publicKey,
                name: exitNode.name,
                listenPort: exitNode.listenPort,
                endpoint: exitNode.endpoint,
                subnet: newSubnet,
                newtId,
                newtSecret: secret,
            },
            success: true,
            error: false,
            message: "Organization retrieved successfully",
            status: HttpCode.OK,
        });
    } catch (error) {
        throw error;
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
