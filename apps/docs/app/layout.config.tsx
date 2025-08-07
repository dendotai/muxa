import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export const baseOptions: BaseLayoutProps = {
  nav: {
    transparentMode: "top",
    title: <span className="font-semibold">muxa</span>,
  },
  links: [
    {
      text: "GitHub",
      url: "https://github.com/dendotai/muxa",
      active: "url",
    },
  ],
};
