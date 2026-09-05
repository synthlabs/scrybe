<script lang="ts">
    import * as Sidebar from "$lib/components/ui/sidebar/index.ts";
    import { page } from "$app/state";
    import { tick } from "svelte";

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

    let activeIndex = $derived(
        items.findIndex((item) => isActivePath(item.url)),
    );
    let group: HTMLElement | null = $state(null);
    let indicatorTop = $state(4);
    let indicatorHeight = $state(32);

    function measureIndicator() {
        const active = group?.querySelector<HTMLElement>(
            '[aria-current="page"]',
        );
        if (!active || !group) return;
        indicatorTop =
            active.getBoundingClientRect().top -
            group.getBoundingClientRect().top;
        indicatorHeight = active.offsetHeight;
    }

    $effect(() => {
        activeIndex;
        items;
        let cancelled = false;
        tick().then(() => {
            if (!cancelled) measureIndicator();
        });
        return () => {
            cancelled = true;
        };
    });

    $effect(() => {
        if (!group) return;
        const observer = new ResizeObserver(measureIndicator);
        observer.observe(group);
        for (const item of group.querySelectorAll("a")) observer.observe(item);
        return () => observer.disconnect();
    });
</script>

<Sidebar.Group bind:ref={group} class="relative p-1">
    <span
        class="nav-active-indicator"
        data-visible={activeIndex >= 0}
        style={`--active-top: ${indicatorTop}px; --active-height: ${indicatorHeight}px`}
        aria-hidden="true"
    ></span>
    <Sidebar.Menu>
        {#each items as item (item.url)}
            {@const active = isActivePath(item.url)}
            <Sidebar.MenuItem data-active={active}>
                <Sidebar.MenuButton
                    isActive={active}
                    class="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-offset-sidebar data-[active=true]:text-muted-foreground data-[active=true]:hover:bg-accent data-[active=true]:hover:text-foreground data-[active=true]:[&>svg]:text-scrybe h-auto min-h-8 min-w-8 overflow-hidden rounded-md px-2 py-1 text-sm font-normal transition-none group-data-[collapsible=icon]:!h-auto group-data-[collapsible=icon]:!w-full group-data-[collapsible=icon]:!py-1 focus-visible:ring-offset-2 data-[active=true]:bg-transparent data-[active=true]:font-normal data-[active=true]:shadow-none [&>svg]:size-4"
                >
                    {#snippet tooltipContent()}
                        {item.title}
                    {/snippet}
                    {#snippet child({ props })}
                        <a
                            href={item.url}
                            {...props}
                            aria-current={active ? "page" : undefined}
                        >
                            <item.icon />
                            <span
                                class="nav-label block shrink-0 break-words whitespace-normal opacity-100 transition-opacity duration-200 ease-linear group-data-[collapsible=icon]:opacity-0"
                                >{item.title}</span
                            >
                        </a>
                    {/snippet}
                </Sidebar.MenuButton>
            </Sidebar.MenuItem>
        {/each}
    </Sidebar.Menu>
</Sidebar.Group>

<style>
    .nav-label {
        /* Lay out text at expanded width while the row clips its reveal. */
        width: calc(var(--sidebar-width) - 3.5rem - 1px);
    }

    .nav-active-indicator {
        position: absolute;
        top: 0;
        left: -0.25rem;
        width: 0.125rem;
        height: var(--active-height);
        pointer-events: none;
        background: var(--c-scrybe);
        opacity: 0;
        transform: translateY(var(--active-top));
        transition:
            transform 100ms linear,
            height 100ms linear,
            opacity 200ms linear;
    }

    .nav-active-indicator[data-visible="true"] {
        opacity: 1;
    }
</style>
