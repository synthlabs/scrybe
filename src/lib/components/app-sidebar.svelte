<script lang="ts">
    import NavMain from "$lib/components/nav-main.svelte";
    import NavSecondary from "$lib/components/nav-secondary.svelte";
    import * as Sidebar from "$lib/components/ui/sidebar/index.ts";

    interface User {
        name: string;
        email: string;
        avatar: string;
    }
    interface NavItem {
        title: string;
        url: string;
        icon: any;
        items?: {
            title: string;
            url: string;
        }[];
    }
    interface Props {
        ref?: any;
        user?: User;
        navMain: NavItem[];
        navSecondary: NavItem[];
        side?: "left" | "right";
        variant?: "sidebar" | "floating" | "inset";
        collapsible?: "offcanvas" | "icon" | "none";
    }

    let {
        ref = $bindable(null),
        user,
        navMain,
        navSecondary,
        ...restProps
    }: Props = $props();
</script>

<Sidebar.Root bind:ref variant="inset" {...restProps}>
    <Sidebar.Content>
        <NavMain items={navMain} />
        <NavSecondary items={navSecondary} class="mt-auto" />
    </Sidebar.Content>
</Sidebar.Root>
