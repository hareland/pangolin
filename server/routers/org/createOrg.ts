import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import { eq } from "drizzle-orm";
import { Org, orgs, roleActions, roles, userOrgs } from "@server/db/schema";
import response from "@server/utils/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { createAdminRole } from "@server/db/ensureActions";
import config from "@server/config";
import { fromError } from "zod-validation-error";
import { defaultRoleAllowedActions } from "../role";

const createOrgSchema = z
    .object({
        orgId: z.string(),
        name: z.string().min(1).max(255)
        // domain: z.string().min(1).max(255).optional(),
    })
    .strict();

const MAX_ORGS = 5;

export async function createOrg(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedBody = createOrgSchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const userOrgIds = req.userOrgIds;
        if (userOrgIds && userOrgIds.length > MAX_ORGS) {
            return next(
                createHttpError(
                    HttpCode.FORBIDDEN,
                    `Maximum number of organizations reached.`
                )
            );
        }

        const { orgId, name } = parsedBody.data;

        // make sure the orgId is unique
        const orgExists = await db
            .select()
            .from(orgs)
            .where(eq(orgs.orgId, orgId))
            .limit(1);

        if (orgExists.length > 0) {
            return next(
                createHttpError(
                    HttpCode.CONFLICT,
                    `Organization with ID ${orgId} already exists`
                )
            );
        }

        let error = "";
        let org: Org | null = null;

        await db.transaction(async (trx) => {
            // create a url from config.app.base_url and get the hostname
            const domain = new URL(config.app.base_url).hostname;

            const newOrg = await trx
                .insert(orgs)
                .values({
                    orgId,
                    name,
                    domain
                })
                .returning();

            if (newOrg.length === 0) {
                error = "Failed to create organization";
                trx.rollback();
                return;
            }

            org = newOrg[0];

            const roleId = await createAdminRole(newOrg[0].orgId);

            if (!roleId) {
                error = "Failed to create Admin role";
                trx.rollback();
                return;
            }

            await trx.insert(userOrgs).values({
                userId: req.user!.userId,
                orgId: newOrg[0].orgId,
                roleId: roleId,
                isOwner: true
            });

            const memberRole = await trx
                .insert(roles)
                .values({
                    name: "Member",
                    description: "Members can only view resources",
                    orgId
                })
                .returning();

            await trx.insert(roleActions).values(
                defaultRoleAllowedActions.map((action) => ({
                    roleId: memberRole[0].roleId,
                    actionId: action,
                    orgId
                }))
            );
        });

        if (!org) {
            return next(
                createHttpError(
                    HttpCode.INTERNAL_SERVER_ERROR,
                    "Failed to createo org"
                )
            );
        }

        if (error) {
            return next(createHttpError(HttpCode.INTERNAL_SERVER_ERROR, error));
        }

        return response(res, {
            data: org,
            success: true,
            error: false,
            message: "Organization created successfully",
            status: HttpCode.CREATED
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
