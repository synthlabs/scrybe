export function isActiveNavPath(pathname: string, href: string): boolean {
    return (pathname || "/") === href;
}
