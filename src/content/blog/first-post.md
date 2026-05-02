---
title: 'SitecoreAI Context ID Security'
description: 'Best practices to securely manage Context IDs for security across enterprise projects'
pubDate: 'May 02 2026'
heroImage: '../../assets/scoping.jpg'
---

## Intro

The `SITECORE_EDGE_CONTEXT_ID` allows for fetching published data from your SitecoreAI tenant.
By default, each environment in SitecoreAI is provisioned with a preview and a live version of this token.
The preview token makes requests against a special endpoint that serves content from the database (for content managers and small-scale preview sites)
while the live version makes requests against Experience Edge.

Previously, Sitecore JSS <span class="tag-deprecated">deprecated</span> required a single server-side environment variable `SITECORE_EDGE_CONTEXT_ID`,
but the new headless delivery layer for SitecoreAI, the Content SDK, introduces a client-side value `NEXT_PUBLIC_SITECORE_EDGE_CONTEXT_ID`[^1].
[^1]: If you're confused about public/private or client-side/server-side variables check out the [Next docs](https://nextjs.org/docs/pages/guides/environment-variables#bundling-environment-variables-for-the-browser).

The [migration documentation](https://doc.sitecore.com/sai/en/developers/content-sdk/10/upgrade-jss-22-0-next-js-apps-to-content-sdk-1-5-1.html#update-configurations-and-environment-variables)[^2] suggests you may need to create this public environment variable, but **this will expose your token to the front end.**
[^2]: Extracted 4/30/2026. Sitecore said they would work on updating this documentation to call out scoping as the correct path forward.

> If needed, create NEXT_PUBLIC_SITECORE_EDGE_CONTEXT_ID with the same value.
> Doing this will expose your context ID secret on the client.

There is no mention of an alternative in the migration documents, and the Developer Settings section of the [Deploy Application](https://doc.sitecore.com/sai/en/developers/sitecoreai/deploy-app.html)
reinforce the same insecure default. When you copy development variables, your server-side and client-side Sitecore Context IDs are always the same value.

While the docs might seem to suggest it is rare for `NEXT_PUBLIC_SITECORE_EDGE_CONTEXT_ID` to be necessary,
it is required for BYOC forms and many other basic Sitecore features, as you can see in the `Bootstrap.tsx` file. [^3]
None of these features work if `config.api.edge?.clientContextId` is not set.

[^3]: Extracted 5/1/2026 from Sitecore's [XM Cloud Starter repository](https://github.com/Sitecore/xmcloud-starter-js)

```typescript
if (config.api.edge?.clientContextId) {
    initContentSdk({
        config: {
            contextId: config.api.edge.clientContextId,
            edgeUrl: config.api.edge.edgeUrl,
            siteName: siteName || config.defaultSite,
        },
        plugins: [
            analyticsPlugin({
                options: {
                    enableCookie: true,
                    cookieDomain: window.location.hostname.replace(/^www\./, ''),
                },
                adapter: analyticsBrowserAdapter(),
            }),
            eventsPlugin(),
        ],
    });
}
```

## Why keep your edge token private?

For a large number of sites, it may seem reasonable to allow your Edge token to be public, and for a developer following the docs, it has *appeared* like this may be the only way forward.
However, this broadens your system's attack surface by allowing for unfettered content enumeration and potential DoS attacks.

### Content enumeration

An unscoped edge token is an easy vector for site-wide enumeration[^4], in which an attacker can query standard root paths and traverse your entire content tree by recursively requesting the `children` of your root items.
For the vast majority of sites, published content is intended to be public, but allowing the full traversal of your `/data` and `/settings` directories in addition to `/content` may not be expected.
At a minimum, governance and vigilance is required to ensure that your entire published content tree is safe to be consumed at any time.

[^4]: As a security measure, Sitecore does keep some fields private from Edge. For example, the `__Created by` field is not exposed to Edge, which helps to prevent [user enumeration](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/03-Identity_Management_Testing/04-Testing_for_Account_Enumeration_and_Guessable_User_Account).

Keep in mind that as of 5/02/2026, the `SITECORE_EDGE_CONTEXT_ID` cannot be scoped by site or site collection.
The Context ID provides global access, so multi-site configurations increase your blast radius and governance dramatically to ensure that all content editors and developers are always publishing as though the internet is enumerating and consuming all of your Sitecore data.

### Limiting your denial of service (DoS) attack surface

As a SaaS service, Experience Edge has a [rate limit](https://doc.sitecore.com/sai/en/developers/sitecoreai/limitations-and-restrictions-of-experience-edge.html#graphql-api-and-query-behavior) of 80 **uncached** requests per second.
Sitecore's caching protects origin a lot, and combined with head app practices like Incremental Static Regeneration ([ISR](https://nextjs.org/docs/app/guides/incremental-static-regeneration)), this is typically not a major concern for most projects.
However, if bad actors had access to your token, they could theoretically mount a (D)DoS attack against you by either:
1. Making arbitrary and arbitrarily complex queries against your system (e.g. `search` operations).
2. Requesting various paths that do not exist, bypassing your cache and the Experience Edge cache.

Even a head app faces some element of this risk.
A simple mental model of the request flow might suggest that the head app is little more than a proxy that obediently translates a URL into a GraphQL request to Sitecore's Edge.

```mermaid alt="A flowchart showing a simplified flow in which an HTTP request is translated into GraphQL, which is returned from Sitecore and parsed for the user."
graph TD;
    U[User] -->|Http request| N[Head App]
    N -->|GraphQL request| E[Sitecore Experience Edge]
    E -->|Response| N
    N -->|Rendered page| U
```

From this vantage point, the attack surface for enumeration and DoS attacks does not appear to be different from handing your Edge Context ID directly to the user.
Any script can hit a SitecoreAI-powered head app or make GraphQL calls directly with the edge token and generate arbitrary paths such that your tenant receives a sustained 429 rate limit response from Sitecore.

However, control over the architecture of your head app provides numerous intervention points against DoS attacks.

#### Head app narrowing of the scope

By default, a Next.js head app built from the [starter template](https://doc.sitecore.com/sai/en/developers/content-sdk/20/creating-a-content-sdk-app.html#new-starter-repository) already meaningfully reduces the number of queries that you can make.
A user cannot execute arbitrary searches or even data requests simply by making an HTTP request to the browser.

*Note*: If you create an unauthenticated API endpoint that proxies arbitrary GraphQL requests to Experience Edge to power client-side requests, you have not meaningfully reduced the attack surface.
Consider backend for frontend ([BFF](https://learn.microsoft.com/en-us/azure/architecture/patterns/backends-for-frontends)) patterns carefully.


#### Web application firewalls (WAF)

Probably the best quick win for head apps to reduce your (D)DoS attack surface is to implement a WAF that proxies incoming requests.
An out-of-the-box setup for any reputable WAF will block (D)DoS traffic patterns, and most WAFs provide additional leverage points like IP-based blocking, path-based blocking (e.g. requests to classic scan paths like `/wp-admin`), and the ability to create temporary and permanent IP block actions.


## The correct pattern: scoping context ids

There is an easy way to scope context IDs to prevent unfettered edge access, and it was actually [announced](https://developers.sitecore.com/changelog/cloud-portal/31102025/context-id-management-in-cloud-portal) at the end of October 2025.[^6]
The Sitecore portal ([https://portal.sitecorecloud.io](https://portal.sitecorecloud.io)) provides a way to generate a scoped Context ID.

That means that for each environment, you should select the parent Context ID and create a scoped token that contains the different Sitecore functionality required for your frontend (e.g. Forms, Scripts, the relevant analytics identifier) but **do not include edge access.**
This scoped token can now safely be included as your `NEXT_PUBLIC_SITECORE_EDGE_CONTEXT_ID`.
You can verify that the token was appropriately scoped locally by using the scoped token for your `SITECORE_EDGE_CONTEXT_ID` value and attempting to build your site.

[^6]: Credit to [Jesper Balle](https://balle.dev/) for pointing this announcement out to me in Sitecore Slack.

### Enforcing this pattern

Once you're aware of this pattern, it's trivial to implement, but enforcement relies on manual steps.
It would be understandable if a confused developer used the same value for both after regenerating context IDs as part of a rotation process.
The Sitecore Deploy app still fills both `SITECORE_EDGE_CONTEXT_ID` and `NEXT_PUBLIC_SITECORE_EDGE_CONTEXT_ID` with the broadly-scoped token even if you have created a scoped one to be used publicly.

Each project may choose to do this differently, but it is worth adding an enforcement step to your deployments or build time validation that asserts `SITECORE_EDGE_CONTEXT_ID !== NEXT_PUBLIC_SITECORE_EDGE_CONTEXT_ID`.
Fail fast and catch this before you have to rotate your keys when someone (eventually) recognizes that you've leaked your tokens.
