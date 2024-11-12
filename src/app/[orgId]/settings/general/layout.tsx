import { internal } from "@app/api";
import { authCookieHeader } from "@app/api/cookies";
import { SidebarSettings } from "@app/components/SidebarSettings";
import { verifySession } from "@app/lib/auth/verifySession";
import OrgProvider from "@app/providers/OrgProvider";
import OrgUserProvider from "@app/providers/OrgUserProvider";
import { GetOrgResponse } from "@server/routers/org";
import { GetOrgUserResponse } from "@server/routers/user";
import { AxiosResponse } from "axios";
import { redirect } from "next/navigation";
import { cache } from "react";

type GeneralSettingsProps = {
    children: React.ReactNode;
    params: Promise<{ orgId: string }>;
};

export default async function GeneralSettingsPage({
    children,
    params,
}: GeneralSettingsProps) {
    const { orgId } = await params;

    const getUser = cache(verifySession);
    const user = await getUser();

    if (!user) {
        redirect("/auth/login");
    }

    let orgUser = null;
    try {
        const getOrgUser = cache(async () =>
            internal.get<AxiosResponse<GetOrgUserResponse>>(
                `/org/${orgId}/user/${user.userId}`,
                await authCookieHeader()
            )
        );
        const res = await getOrgUser();
        orgUser = res.data.data;
    } catch {
        redirect(`/${orgId}`);
    }

    let org = null;
    try {
        const getOrg = cache(async () =>
            internal.get<AxiosResponse<GetOrgResponse>>(
                `/org/${orgId}`,
                await authCookieHeader()
            )
        );
        const res = await getOrg();
        org = res.data.data;
    } catch {
        redirect(`/${orgId}`);
    }

    const sidebarNavItems = [
        {
            title: "General",
            href: `/{orgId}/settings/general`,
        },
    ];

    return (
        <>
            <OrgProvider org={org}>
                <OrgUserProvider orgUser={orgUser}>
                    <div className="space-y-0.5 select-none mb-6">
                        <h2 className="text-2xl font-bold tracking-tight">
                            General
                        </h2>
                        <p className="text-muted-foreground">
                            Configure your organization's general settings
                        </p>
                    </div>
                    <SidebarSettings sidebarNavItems={sidebarNavItems}>
                        {children}
                    </SidebarSettings>
                </OrgUserProvider>
            </OrgProvider>
        </>
    );
}
