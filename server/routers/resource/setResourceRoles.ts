import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import { roleResources, roles } from "@server/db/schema";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { eq, and, ne } from "drizzle-orm";

const setResourceRolesBodySchema = z
    .object({
        roleIds: z.array(z.number().int().positive())
    })
    .strict();

const setResourceRolesParamsSchema = z
    .object({
        resourceId: z
            .string()
            .transform(Number)
            .pipe(z.number().int().positive())
    })
    .strict();

export async function setResourceRoles(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedBody = setResourceRolesBodySchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { roleIds } = parsedBody.data;

        const parsedParams = setResourceRolesParamsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { resourceId } = parsedParams.data;

        // get this org's admin role
        const adminRole = await db
            .select()
            .from(roles)
            .where(
                and(
                    eq(roles.name, "Admin"),
                    eq(roles.orgId, req.userOrg!.orgId)
                )
            )
            .limit(1);

        if (!adminRole.length) {
            return next(
                createHttpError(
                    HttpCode.INTERNAL_SERVER_ERROR,
                    "Admin role not found"
                )
            );
        }

        if (roleIds.includes(adminRole[0].roleId)) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "Admin role cannot be assigned to resources"
                )
            );
        }

        await db.transaction(async (trx) => {
            await trx.delete(roleResources).where(
                and(
                    eq(roleResources.resourceId, resourceId),
                    ne(roleResources.roleId, adminRole[0].roleId) // delete all but the admin role
                )
            );

            const newRoleResources = await Promise.all(
                roleIds.map((roleId) =>
                    trx
                        .insert(roleResources)
                        .values({ roleId, resourceId })
                        .returning()
                )
            );

            return response(res, {
                data: {},
                success: true,
                error: false,
                message: "Roles set for resource successfully",
                status: HttpCode.CREATED
            });
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
