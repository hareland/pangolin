import { verify } from "@node-rs/argon2";
import { generateSessionToken } from "@server/auth";
import db from "@server/db";
import {
    orgs,
    resourceOtp,
    resourcePincode,
    resources
} from "@server/db/schema";
import HttpCode from "@server/types/HttpCode";
import response from "@server/utils/response";
import { and, eq } from "drizzle-orm";
import { NextFunction, Request, Response } from "express";
import createHttpError from "http-errors";
import { z } from "zod";
import { fromError } from "zod-validation-error";
import {
    createResourceSession,
    serializeResourceSessionCookie
} from "@server/auth/resource";
import logger from "@server/logger";
import config from "@server/config";
import { AuthWithPasswordResponse } from "./authWithPassword";
import { isValidOtp, sendResourceOtpEmail } from "@server/auth/resourceOtp";

export const authWithPincodeBodySchema = z.object({
    pincode: z.string(),
    email: z.string().email().optional(),
    otp: z.string().optional()
});

export const authWithPincodeParamsSchema = z.object({
    resourceId: z.string().transform(Number).pipe(z.number().int().positive())
});

export type AuthWithPincodeResponse = {
    otpRequested?: boolean;
    otpSent?: boolean;
    session?: string;
};

export async function authWithPincode(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    const parsedBody = authWithPincodeBodySchema.safeParse(req.body);

    if (!parsedBody.success) {
        return next(
            createHttpError(
                HttpCode.BAD_REQUEST,
                fromError(parsedBody.error).toString()
            )
        );
    }

    const parsedParams = authWithPincodeParamsSchema.safeParse(req.params);

    if (!parsedParams.success) {
        return next(
            createHttpError(
                HttpCode.BAD_REQUEST,
                fromError(parsedParams.error).toString()
            )
        );
    }

    const { resourceId } = parsedParams.data;
    const { email, pincode, otp } = parsedBody.data;

    try {
        const [result] = await db
            .select()
            .from(resources)
            .leftJoin(
                resourcePincode,
                eq(resourcePincode.resourceId, resources.resourceId)
            )
            .leftJoin(orgs, eq(orgs.orgId, resources.orgId))
            .where(eq(resources.resourceId, resourceId))
            .limit(1);

        const resource = result?.resources;
        const org = result?.orgs;
        const definedPincode = result?.resourcePincode;

        if (!org) {
            return next(
                createHttpError(
                    HttpCode.INTERNAL_SERVER_ERROR,
                    "Org does not exist"
                )
            );
        }

        if (!resource) {
            return next(
                createHttpError(HttpCode.BAD_REQUEST, "Resource does not exist")
            );
        }

        if (!definedPincode) {
            return next(
                createHttpError(
                    HttpCode.UNAUTHORIZED,
                    createHttpError(
                        HttpCode.BAD_REQUEST,
                        "Resource has no pincode protection"
                    )
                )
            );
        }

        const validPincode = await verify(definedPincode.pincodeHash, pincode, {
            memoryCost: 19456,
            timeCost: 2,
            outputLen: 32,
            parallelism: 1
        });
        if (!validPincode) {
            return next(
                createHttpError(HttpCode.UNAUTHORIZED, "Incorrect PIN")
            );
        }

        if (resource.otpEnabled) {
            if (otp && email) {
                const isValidCode = await isValidOtp(
                    email,
                    resource.resourceId,
                    otp
                );
                if (!isValidCode) {
                    return next(
                        createHttpError(HttpCode.UNAUTHORIZED, "Incorrect OTP")
                    );
                }

                await db
                    .delete(resourceOtp)
                    .where(
                        and(
                            eq(resourceOtp.email, email),
                            eq(resourceOtp.resourceId, resource.resourceId)
                        )
                    );
            } else if (email) {
                try {
                    await sendResourceOtpEmail(
                        email,
                        resource.resourceId,
                        resource.name,
                        org.name
                    );
                    return response<AuthWithPasswordResponse>(res, {
                        data: { otpSent: true },
                        success: true,
                        error: false,
                        message: "Sent one-time otp to email address",
                        status: HttpCode.ACCEPTED
                    });
                } catch (e) {
                    logger.error(e);
                    return next(
                        createHttpError(
                            HttpCode.INTERNAL_SERVER_ERROR,
                            "Failed to send one-time otp. Make sure the email address is correct and try again."
                        )
                    );
                }
            } else {
                return response<AuthWithPasswordResponse>(res, {
                    data: { otpRequested: true },
                    success: true,
                    error: false,
                    message: "One-time otp required to complete authentication",
                    status: HttpCode.ACCEPTED
                });
            }
        }

        const token = generateSessionToken();
        await createResourceSession({
            resourceId,
            token,
            pincodeId: definedPincode.pincodeId,
            usedOtp: otp !== undefined,
            email
        });
        const cookieName = `${config.server.resource_session_cookie_name}_${resource.resourceId}`;
        const cookie = serializeResourceSessionCookie(
            cookieName,
            token,
            resource.fullDomain
        );
        res.appendHeader("Set-Cookie", cookie);

        return response<AuthWithPincodeResponse>(res, {
            data: {
                session: token
            },
            success: true,
            error: false,
            message: "Authenticated with resource successfully",
            status: HttpCode.OK
        });
    } catch (e) {
        logger.error(e);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Failed to authenticate with resource"
            )
        );
    }
}
