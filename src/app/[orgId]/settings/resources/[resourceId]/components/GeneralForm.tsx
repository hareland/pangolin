"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { CaretSortIcon, CheckIcon } from "@radix-ui/react-icons";
import { Input } from "@/components/ui/input";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";

import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { useResourceContext } from "@app/hooks/useResourceContext";
import { ListSitesResponse } from "@server/routers/site";
import { useEffect, useState } from "react";
import { AxiosResponse } from "axios";
import api from "@app/api";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";

const GeneralFormSchema = z.object({
    name: z.string(),
    siteId: z.number(),
});

type GeneralFormValues = z.infer<typeof GeneralFormSchema>;

export function GeneralForm() {
    const params = useParams();
    const orgId = params.orgId;
    const { resource, updateResource } = useResourceContext();
    const [sites, setSites] = useState<ListSitesResponse["sites"]>([]);

    const form = useForm<GeneralFormValues>({
        resolver: zodResolver(GeneralFormSchema),
        defaultValues: {
            name: resource?.name,
            siteId: resource?.siteId,
        },
        mode: "onChange",
    });

    useEffect(() => {
        if (typeof window !== "undefined") {
            const fetchSites = async () => {
                const res = await api.get<AxiosResponse<ListSitesResponse>>(
                    `/org/${orgId}/sites/`
                );
                setSites(res.data.data.sites);
            };
            fetchSites();
        }
    }, []);

    async function onSubmit(data: GeneralFormValues) {
        await updateResource({ name: data.name, siteId: data.siteId });
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Name</FormLabel>
                            <FormControl>
                                <Input {...field} />
                            </FormControl>
                            <FormDescription>
                                This is the display name of the resource.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="siteId"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>Site</FormLabel>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <FormControl>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            className={cn(
                                                "w-[350px] justify-between",
                                                !field.value &&
                                                    "text-muted-foreground"
                                            )}
                                        >
                                            {field.value
                                                ? sites.find(
                                                      (site) =>
                                                          site.siteId ===
                                                          field.value
                                                  )?.name
                                                : "Select site"}
                                            <CaretSortIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-[350px] p-0">
                                    <Command>
                                        <CommandInput placeholder="Search site..." />
                                        <CommandList>
                                            <CommandEmpty>
                                                No site found.
                                            </CommandEmpty>
                                            <CommandGroup>
                                                {sites.map((site) => (
                                                    <CommandItem
                                                        value={site.name}
                                                        key={site.siteId}
                                                        onSelect={() => {
                                                            form.setValue(
                                                                "siteId",
                                                                site.siteId
                                                            );
                                                        }}
                                                    >
                                                        <CheckIcon
                                                            className={cn(
                                                                "mr-2 h-4 w-4",
                                                                site.siteId ===
                                                                    field.value
                                                                    ? "opacity-100"
                                                                    : "opacity-0"
                                                            )}
                                                        />
                                                        {site.name}
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                            <FormDescription>
                                This is the site that will be used in the
                                dashboard.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <Button type="submit">Update Resource</Button>
            </form>
        </Form>
    );
}
