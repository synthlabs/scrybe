<script lang="ts">
    import * as Collapsible from "$lib/components/ui/collapsible/index.ts";
    import * as Sidebar from "$lib/components/ui/sidebar/index.ts";
    import ChevronRight from "lucide-svelte/icons/chevron-right";
    import { page } from "$app/state";

    const isActivePath = (current: string): boolean => {
        return current === page.url.pathname;
    };

    let {
        items,
    }: {
        items: {
            title: string;
            url: string;
            // This should be `Component` after lucide-svelte updates types
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            icon: any;
            items?: {
                title: string;
                url: string;
            }[];
        }[];
    } = $props();
</script>

<Sidebar.Group>
    <Sidebar.GroupLabel>Scrybe</Sidebar.GroupLabel>
    <Sidebar.Menu>
        {#each items as mainItem (mainItem.title)}
            <Collapsible.Root open={isActivePath(mainItem.url)}>
                {#snippet child({ props })}
                    <Sidebar.MenuItem {...props}>
                        <Sidebar.MenuButton
                            isActive={isActivePath(mainItem.url)}
                        >
                            {#snippet tooltipContent()}
                                {mainItem.title}
                            {/snippet}
                            {#snippet child({ props })}
                                <a href={mainItem.url} {...props}>
                                    <mainItem.icon />
                                    <span>{mainItem.title}</span>
                                </a>
                            {/snippet}
                        </Sidebar.MenuButton>
                        {#if mainItem.items?.length}
                            <Collapsible.Trigger>
                                {#snippet child({ props })}
                                    <Sidebar.MenuAction
                                        {...props}
                                        class="data-[state=open]:rotate-90"
                                    >
                                        <ChevronRight />
                                        <span class="sr-only">Toggle</span>
                                    </Sidebar.MenuAction>
                                {/snippet}
                            </Collapsible.Trigger>
                            <Collapsible.Content>
                                <Sidebar.MenuSub>
                                    {#each mainItem.items as subItem (subItem.title)}
                                        <Sidebar.MenuSubItem>
                                            <Sidebar.MenuSubButton
                                                href={subItem.url}
                                            >
                                                <span>{subItem.title}</span>
                                            </Sidebar.MenuSubButton>
                                        </Sidebar.MenuSubItem>
                                    {/each}
                                </Sidebar.MenuSub>
                            </Collapsible.Content>
                        {/if}
                    </Sidebar.MenuItem>
                {/snippet}
            </Collapsible.Root>
        {/each}
    </Sidebar.Menu>
</Sidebar.Group>
