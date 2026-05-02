---
title: 'Scoping Your SitecoreAI Context IDs'
description: 'Discover the right way to securely manage SitecoreAI Context IDs for the Content SDK'
pubDate: 'May 02 2026'
heroImage: '../../assets/posts/scoping.jpg'
---

## Introduction
There has been some confusion in the Sitecore community around securely managing the `SITECORE_EDGE_CONTEXT_ID` as applications adopt the [Content SDK](https://doc.sitecore.com/sai/en/developers/content-sdk/20/sitecore-content-sdk-for-sitecoreai.html) for SitecoreAI with Next.js.
This post explores the confusion, explains why you should not include your broadly-scoped context ID in the browser bundle, and points to the correct pattern: scoped context IDs.

## The problem

The `SITECORE_EDGE_CONTEXT_ID` allows for fetching published data from your SitecoreAI tenant.
By default, each environment in SitecoreAI is provisioned with a preview and a live version of this token.[^token]
Previously, Sitecore JSS <span class="tag-deprecated">deprecated</span> required your context ID in a server-side environment variable `SITECORE_EDGE_CONTEXT_ID`, which is secure by default.
[^token]: The preview context ID allows you to make requests against the [Preview endpoint](https://doc.sitecore.com/sai/en/developers/sitecoreai/the-preview-graphql-endpoint.html) that serves content from CM (for content managers and small-scale preview sites) while the live ID makes requests against Experience Edge.

The new headless delivery layer for SitecoreAI, the Content SDK, introduces a new client-side value `NEXT_PUBLIC_SITECORE_EDGE_CONTEXT_ID` along with the required server-side environment variable.[^public]
The [migration documentation](https://doc.sitecore.com/sai/en/developers/content-sdk/10/upgrade-jss-22-0-next-js-apps-to-content-sdk-1-5-1.html#update-configurations-and-environment-variables)[^extracted] suggests you may not need the value, and warns that setting it **will expose your token to the internet.**

[^public]: If you're confused about public/private or client-side/server-side variables check out the [Next docs](https://nextjs.org/docs/pages/guides/environment-variables#bundling-environment-variables-for-the-browser).
[^extracted]: Extracted 5/02/2026. Sitecore said they would work on updating this documentation to call out scoping as the correct path forward.

> If needed, create NEXT_PUBLIC_SITECORE_EDGE_CONTEXT_ID with the same value.
> Doing this will expose your context ID secret on the client.

While the documentation seems to suggest it is uncommon for `NEXT_PUBLIC_SITECORE_EDGE_CONTEXT_ID` to be necessary,
it is required out of the box for Sitecore forms and several other basic Sitecore features, as you can see in the `Bootstrap.tsx` file.[^code-date]
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

For a large number of sites, it may seem reasonable to allow your Context ID to be public.
For a developer following the migration docs, it has *appeared* like this may be the only way forward.
However, exposing your context ID broadens your system's attack surface by allowing for broad content enumeration and potential (D)DoS attacks.

### Content enumeration

An unscoped context ID is a clear vector for site-wide enumeration.[^enumeration]
Anyone with the token can query your Sitecore root and traverse your entire tree by recursively requesting the `children` of each item.
For the vast majority of sites, published content is public, but allowing the full traversal of your `/data` and `/settings` directories in addition to `/content` may not be expected.
At a minimum, governance and vigilance is required to ensure that the entire published content tree is safe for public consumption.

[^enumeration]: As a security measure, Sitecore does keep some fields private from Edge. For example, the `__Created by` field is not exposed to Edge, which helps to prevent [user enumeration](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/03-Identity_Management_Testing/04-Testing_for_Account_Enumeration_and_Guessable_User_Account).

>[!NOTE]
> Keep in mind that currently, the `SITECORE_EDGE_CONTEXT_ID` cannot be scoped by site or site collection.
> The Context ID provides global access, so multi-site instances increase your blast radius and governance burden.

### Limiting your denial of service (DoS) attack surface

As a SaaS service, Experience Edge has a [rate limit](https://doc.sitecore.com/sai/en/developers/sitecoreai/limitations-and-restrictions-of-experience-edge.html#graphql-api-and-query-behavior) of 80 **uncached** requests per second.
Sitecore's caching protects origin a lot, and combined with head app practices like Incremental Static Regeneration ([ISR](https://nextjs.org/docs/app/guides/incremental-static-regeneration)), this is typically not a major concern for most projects.
However, if bad actors have your context ID, they could theoretically mount a (D)DoS attack against you by either:
1. Making random, arbitrarily complex queries against your system (e.g. `search` operations).
2. Requesting random paths that do not exist, bypassing the Experience Edge cache.

```mermaid title="Unprotected flow: with the context ID exposed client-side, anyone can make arbitrary GraphQL requests directly to Sitecore Experience Edge"
graph TD;
    U[User] -->|GraphQL request| E[Sitecore Experience Edge]
```

*Figure 1: With the context ID exposed, there are no intervention points you control to prevent an attacker from querying Experience Edge directly.*

Compare that attack surface to an even minimally-hardened head application with a Web Application Firewall (WAF) proxying requests
and the narrower set of queries that a Next.js head app will make to render an http request.[^bff-warning]

[^bff-warning]: If you create an unauthenticated API endpoint that proxies arbitrary GraphQL requests to Experience Edge to power client-side requests, you have not meaningfully reduced the attack surface.
Consider backend for frontend ([backend for frontend](https://learn.microsoft.com/en-us/azure/architecture/patterns/backends-for-frontends)) patterns carefully.

```mermaid title="Hardened flow: HTTP requests are proxied through a Web Application Firewall and head app, limiting what can reach Sitecore Experience Edge"
graph TD;
    U[User] -->|Http request| W[Web Application Firewall]
    W[Web Application Firewall] -->  N[Head App]
    N -->|GraphQL request| E[Sitecore Experience Edge]
```

*Figure 2: A WAF and head app constrain the type and rate of queries that can reach Experience Edge.*

With a fully-scoped public Context ID, your only recourse against abuse of the token is to regenerate the Context ID and redeploy your application(s).
This mitigation is unsustainable against sustained abuse; as soon as you redeploy there's a new broadly-scoped Context ID available for attackers.
There is a much simpler way to securely enable Sitecore features clientside.

## Scoping context ids

Sitecore has created a GUI to scope context IDs so that they do not include edge access, and it was actually [deployed](https://developers.sitecore.com/changelog/cloud-portal/31102025/context-id-management-in-cloud-portal) at the end of October 2025.[^jesper-credit]
The Sitecore portal ([https://portal.sitecorecloud.io](https://portal.sitecorecloud.io)) provides a simple way to generate a scoped Context ID.

[^jesper-credit]: Credit to [Jesper Balle](https://balle.dev/) for pointing this announcement out to me in Sitecore Slack.

For each environment, you should select the parent Context ID and create a scoped token that contains the Sitecore functionality required for your frontend (e.g. Forms, Scripts, a relevant analytics identifier) but **do not include edge access.**
This scoped token can now safely be included as your `NEXT_PUBLIC_SITECORE_EDGE_CONTEXT_ID`.
There are a number of ways to verify the token was scoped correctly, but one simple method is to set it as your `SITECORE_EDGE_CONTEXT_ID` value locally and attempt to build your site.

> [!Caution]
> If you have deployed a broadly-scoped context ID, you should consider your current Context IDs compromised.
> It is a best practice to first [regenerate your Context IDs](https://doc.sitecore.com/sai/en/developers/sitecoreai/context-id-environment-variables.html#regenerate-an-environments-context-ids), **then** create a scoped token and redeploy.

## Enforcing scoped context ids

Once you're aware of this pattern, it's trivial to implement it, but you'll want some way to enforce this pattern on larger teams.
It's far too easy to accidentally use your broadly-scoped Context ID as the client-side variable.
Given the current lack of visibility into scoped Context IDs outside the Sitecore Portal, a developer might accidentally use the same value client and server-side after regenerating context IDs.

> [!Warning]
> There remains an insecure default in the Deploy application -- the first place most developers learn to get the Context ID from.
> No matter how many scoped Context IDs you create, the Sitecore Deploy app still fills both `SITECORE_EDGE_CONTEXT_ID` and `NEXT_PUBLIC_SITECORE_EDGE_CONTEXT_ID` with your broadly-scoped Context ID.

Configure a step that asserts `SITECORE_EDGE_CONTEXT_ID !== NEXT_PUBLIC_SITECORE_EDGE_CONTEXT_ID` in your build pipeline.
Fail fast and catch this before you leak your production context ID.
