<script lang="ts">
    import * as Sidebar from "$lib/components/ui/sidebar/index.ts";
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            icon: any;
        }[];
    } = $props();
</script>

<Sidebar.Group>
    <Sidebar.Menu>
        {#each items as item (item.title)}
            <Sidebar.MenuItem>
                <Sidebar.MenuButton
                    isActive={isActivePath(item.url)}
                    class="data-[active=true]:bg-scrybe-soft data-[active=true]:color-gray-200 data-[active=true]:[&>svg]:text-scrybe data-[active=true]:hover:bg-scrybe-soft data-[active=true]:hover:text-scrybe hover:text-scrybe data-[active=true]:shadow-[inset_2px_0_0_0_hsl(var(--c-scrybe))]"
                >
                    {#snippet tooltipContent()}
                        {item.title}
                    {/snippet}
                    {#snippet child({ props })}
                        <a href={item.url} {...props}>
                            <item.icon />
                            <span>{item.title}</span>
                        </a>
                    {/snippet}
                </Sidebar.MenuButton>
            </Sidebar.MenuItem>
        {/each}
    </Sidebar.Menu>
</Sidebar.Group>
