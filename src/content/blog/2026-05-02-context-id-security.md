---
title: 'SitecoreAI Context ID Security'
description: 'Discover best practices to securely manage SitecoreAI Context IDs with the Content SDK'
pubDate: 'May 02 2026'
heroImage: '../../assets/posts/scoping.jpg'
---

## Intro
There has been some confusion in the Sitecore community around securely managing the `SITECORE_EDGE_CONTEXT_ID` as applications adopt the [Content SDK](https://doc.sitecore.com/sai/en/developers/content-sdk/20/sitecore-content-sdk-for-sitecoreai.html) for SitecoreAI with Next.js.
This post explores the confusion, explains why you should not include your broadly-scoped context ID in the browser bundle, and points to the correct pattern: scoped context IDs.

## The problem

The `SITECORE_EDGE_CONTEXT_ID` allows for fetching published data from your SitecoreAI tenant.
By default, each environment in SitecoreAI is provisioned with a preview and a live version of this token.[^token]
Previously, Sitecore JSS <span class="tag-deprecated">deprecated</span> required your context ID in a server-side environment variable `SITECORE_EDGE_CONTEXT_ID`, which is secure by default.
[^token]: The preview context ID allows you to make requests against the [Preview endpoint](https://doc.sitecore.com/sai/en/developers/sitecoreai/the-preview-graphql-endpoint.html) that serves content from CM (for content managers and small-scale preview sites) while the live ID makes requests against Experience Edge.

The new headless delivery layer for SitecoreAI, the Content SDK, introduces the "soft" requirement for a client-side value `NEXT_PUBLIC_SITECORE_EDGE_CONTEXT_ID` along with the required server-side environemnt variable.[^public]
The [migration documentation](https://doc.sitecore.com/sai/en/developers/content-sdk/10/upgrade-jss-22-0-next-js-apps-to-content-sdk-1-5-1.html#update-configurations-and-environment-variables)[^extracted] suggests you may not need the value, but recognizes that creating it **will expose your token to the internet.**

[^public]: If you're confused about public/private or client-side/server-side variables check out the [Next docs](https://nextjs.org/docs/pages/guides/environment-variables#bundling-environment-variables-for-the-browser).
[^extracted]: Extracted 5/02/2026. Sitecore said they would work on updating this documentation to call out scoping as the correct path forward.

> If needed, create NEXT_PUBLIC_SITECORE_EDGE_CONTEXT_ID with the same value.
> Doing this will expose your context ID secret on the client.

While the docs framing seems to suggest it is uncommon for `NEXT_PUBLIC_SITECORE_EDGE_CONTEXT_ID` to be set,
it is required for BYOC forms and many other basic Sitecore features, as you can see in the `Bootstrap.tsx` file. [^code-date]
None of these features work if `config.api.edge?.clientContextId` is not set.

[^code-date]: Extracted 5/1/2026 from Sitecore's [XM Cloud Starter repository](https://github.com/Sitecore/xmcloud-starter-js)

```typescript
if (config.api.edge?.clientContextId) {
    initContentSdk({
        config: {
            contextId: config.api.edge.clientContextId,
            edgeUrl: config.api.edge.edgeUrl,
            siteName: siteName || config.defaultSite,
        },
        plugins: [
        // Code omitted
        ]
    });
}
```

## Why keep your edge context ID private?

For a large number of sites, it may seem reasonable to allow your Context ID to be public, and for a developer following the docs, it has *appeared* like this may be the only way forward.
However, exposing your context ID broadens your system's attack surface by allowing for broad content enumeration and potential (D)DoS attacks.

### Content enumeration

An unscoped context ID is an easy vector for site-wide enumeration,[^enumeration] in which an attacker can query your Sitecore root and traverse your entire tree by recursively requesting the `children` of each item.
For the vast majority of sites, published content is public, but allowing the full traversal of your `/data` and `/settings` directories in addition to `/content` may not be expected behavior.
At a minimum, governance and vigilance is required to ensure that the entire published content tree is safe to be consumed at any time.

[^enumeration]: As a security measure, Sitecore does keep some fields private from Edge. For example, the `__Created by` field is not exposed to Edge, which helps to prevent [user enumeration](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/03-Identity_Management_Testing/04-Testing_for_Account_Enumeration_and_Guessable_User_Account).

Keep in mind that currently, the `SITECORE_EDGE_CONTEXT_ID` cannot be scoped by site or site collection.
The Context ID provides global access, so multi-site instances increase your blast radius and governance burden.

### Limiting your denial of service (DoS) attack surface

As a SaaS service, Experience Edge has a [rate limit](https://doc.sitecore.com/sai/en/developers/sitecoreai/limitations-and-restrictions-of-experience-edge.html#graphql-api-and-query-behavior) of 80 **uncached** requests per second.
Sitecore's caching protects origin a lot, and combined with head app practices like Incremental Static Regeneration ([ISR](https://nextjs.org/docs/app/guides/incremental-static-regeneration)), this is typically not a major concern for most projects.
However, if bad actors have your context ID, they could theoretically mount a (D)DoS attack against you by either:
1. Making random, arbitrarily complex queries against your system (e.g. `search` operations).
2. Requesting random paths that do not exist, bypassing the Experience Edge cache.

```mermaid alt="A flowchart showing a simplified flow in which an HTTP request is translated into GraphQL, which is returned from Sitecore and parsed for the user."
graph TD;
    U[User] -->|GraphQL request| E[Sitecore Experience Edge]
```

Compare that attack surface to an even minimally-hardened head application with a Web Application Firewall (WAF) proxying requests
and the limited type of queries that can be made by hitting a SitecoreAI.[^bff-warning]

[^bff-warning]: If you create an unauthenticated API endpoint that proxies arbitrary GraphQL requests to Experience Edge to power client-side requests, you have not meaningfully reduced the attack surface.
Consider backend for frontend ([backend for frontend](https://learn.microsoft.com/en-us/azure/architecture/patterns/backends-for-frontends)) patterns carefully.

```mermaid alt="A flowchart showing a simplified flow in which an HTTP request is translated into GraphQL, which is returned from Sitecore and parsed for the user."
graph TD;
    U[User] -->|Http request| W[Web Application Firewall]
    W[Web Application Firewall] -->  N[Head App]
    N -->|GraphQL request| E[Sitecore Experience Edge]
```

## The correct pattern: scoping context ids

There is an easy way to scope context IDs to prevent unfettered edge access, and it was actually [announced](https://developers.sitecore.com/changelog/cloud-portal/31102025/context-id-management-in-cloud-portal) at the end of October 2025.[^jesper-credit]
The Sitecore portal ([https://portal.sitecorecloud.io](https://portal.sitecorecloud.io)) provides a way to generate a scoped Context ID.

That means that for each environment, you should select the parent Context ID and create a scoped token that contains the different Sitecore functionality required for your frontend (e.g. Forms, Scripts, the relevant analytics identifier) but **do not include edge access.**
This scoped token can now safely be included as your `NEXT_PUBLIC_SITECORE_EDGE_CONTEXT_ID`.
You can verify that the token was appropriately scoped locally by using the scoped token for your `SITECORE_EDGE_CONTEXT_ID` value and attempting to build your site.

[^jesper-credit]: Credit to [Jesper Balle](https://balle.dev/) for pointing this announcement out to me in Sitecore Slack.

### Enforcing this pattern

Once you're aware of this pattern, it's trivial to implement, but you'll want some way to enforce this pattern on larger teams.
The Sitecore Deploy app still fills both `SITECORE_EDGE_CONTEXT_ID` and `NEXT_PUBLIC_SITECORE_EDGE_CONTEXT_ID` with the broadly-scoped token even if you have created a scoped one to be used publicly.
Given the current lack of visibility into scoped Context IDs outside the Sitecore Portal, a developer might accidentally use the same value client and server-side after regenerating context IDs.

You could set this up in your pipelines or build-time validation, but configure a step that asserts `SITECORE_EDGE_CONTEXT_ID !== NEXT_PUBLIC_SITECORE_EDGE_CONTEXT_ID`.
Fail fast and catch this before you leak your production context ID.
