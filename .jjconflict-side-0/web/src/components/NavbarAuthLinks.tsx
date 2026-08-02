import React from "react";
import clsx from "clsx";
import { useAuth } from "./AuthProvider";
import { APP_DEEP_LINK, APP_DOWNLOAD_URL } from "../lib/constants";

type Props = {
  mobile?: boolean;
  className?: string;
};

export default function NavbarAuthLinks({
  mobile = false,
  className,
}: Props): React.ReactNode {
  const { user } = useAuth();
  const signedIn = !!user;

  const accountHref = signedIn ? "/dashboard" : "/sign-in";
  const accountLabel = signedIn ? "Dashboard" : "Sign in";
  const ctaHref = signedIn ? APP_DEEP_LINK : APP_DOWNLOAD_URL;
  const ctaLabel = signedIn ? "Open App" : "Get Started";

  const Wrapper: "li" | "div" = mobile ? "li" : "div";
  const wrapperClass = clsx(
    {
      navbar__item: !mobile,
      "menu__list-item": mobile,
    },
    className,
  );

  return (
    <>
      <Wrapper className={wrapperClass}>
        <a
          href={accountHref}
          className="button button--secondary button--outline button--sm"
        >
          {accountLabel}
        </a>
      </Wrapper>
      <Wrapper className={wrapperClass}>
        <a href={ctaHref} className="button button--primary button--sm">
          {ctaLabel}
        </a>
      </Wrapper>
    </>
  );
}
