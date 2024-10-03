import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db } from '@server/db';
import { sites } from '@server/db/schema';
import response from "@server/utils/response";
import HttpCode from '@server/types/HttpCode';
import createHttpError from 'http-errors';

const createSiteParamsSchema = z.object({ 
    orgId: z.number().int().positive(),
});

// Define Zod schema for request body validation
const createSiteSchema = z.object({
  name: z.string().min(1).max(255),
  subdomain: z.string().min(1).max(255).optional(),
  pubKey: z.string().optional(),
  subnet: z.string().optional(),
});

export async function createSite(req: Request, res: Response, next: NextFunction): Promise<any> {
  try {
    // Validate request body
    const parsedBody = createSiteSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return next(
        createHttpError(
          HttpCode.BAD_REQUEST,
          parsedBody.error.errors.map(e => e.message).join(', ')
        )
      );
    }

    const { name, subdomain, pubKey, subnet } = parsedBody.data;

    // Validate request params
    const parsedParams = createSiteParamsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return next(
        createHttpError(
          HttpCode.BAD_REQUEST,
          parsedParams.error.errors.map(e => e.message).join(', ')
        )
      );
    }

    const { orgId } = parsedParams.data;

    // Create new site in the database
    const newSite = await db.insert(sites).values({
      orgId,
      name,
      subdomain,
      pubKey,
      subnet,
    }).returning();

    return res.status(HttpCode.CREATED).send(
      response(res, {
        data: newSite[0],
        success: true,
        error: false,
        message: "Site created successfully",
        status: HttpCode.CREATED,
      })
    );
  } catch (error) {
    next(error);
  }
}