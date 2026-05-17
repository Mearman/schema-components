import { useEffect, useState } from "react";

/**
 * Tracks the current theme by observing the `light-theme` / `dark-theme`
 * class that `@storybook/addon-themes` puts on the iframe's `<html>` element.
 * Falls back to `prefers-color-scheme` when neither class is present.
 *
 * Theme-adapter stories use this to keep MUI/Mantine/Radix/shadcn in lockstep
 * with the Storybook toolbar toggle so the rendered demo always matches the
 * surrounding chrome.
 */
export function useThemeClass(): "light" | "dark" {
    const [scheme, setScheme] = useState<"light" | "dark">(() => detect());

    useEffect(() => {
        if (typeof document === "undefined") return;
        const observer = new MutationObserver(() => {
            setScheme(detect());
        });
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class"],
        });
        const media = window.matchMedia("(prefers-color-scheme: dark)");
        const onMediaChange = () => {
            setScheme(detect());
        };
        media.addEventListener("change", onMediaChange);
        return () => {
            observer.disconnect();
            media.removeEventListener("change", onMediaChange);
        };
    }, []);

    return scheme;
}

function detect(): "light" | "dark" {
    if (typeof document === "undefined") return "light";
    const cls = document.documentElement.classList;
    if (cls.contains("dark-theme")) return "dark";
    if (cls.contains("light-theme")) return "light";
    if (
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
        return "dark";
    }
    return "light";
}
