---
lang: en-US
icon: 'mdi:music-circle'
title: EdgeSonic — Why I Moved My Music Library to the Edge
date: 2026-10-28T00:00:00.000Z
category:
  - 开源项目
tag:
  - EdgeSonic
  - Cloudflare
  - Workers
  - Serverless
  - Subsonic
  - AGPL
  - 自托管
---

A complete, multi-user, Subsonic-compatible music service with no servers and no always-on processes. Here's why I built it. {.textkai}

<!-- more -->

[EdgeSonic](https://github.com/lsy-404/edgesonic) is open source under AGPL-3.0, and it's the first full multi-user service I've designed from scratch around an edge architecture. It aims to give self-hosted music another option: no NAS and no server, with noticeably lower cost, better stability, and less maintenance burden than either. If you'd rather use it alongside what you already have, it can act as a front end with your existing storage behind it.

I had this idea for a long time before I started writing code. What finally made me commit to finishing it were the following things.

## 1. Navidrome wasn't enough, and my home NAS wasn't reliable

Navidrome was the first thing I used. Its playback is excellent, but I wanted more than playback: tags that I can edit, albums that I can organize, and multiple users who each manage their own favorites and playlists. When the features don't match, even a great player is only half an answer.

On the other side, my home NAS wasn't exactly worry-free either. I have two, each with its own problems: the residential broadband in Canada acts up from time to time, and the one in China doesn't have enough upload bandwidth. You don't notice it with small requests, but large files are a different story. A full-album WAV, for example, fails to play entirely after a single interruption, and music happens to be all about large files. Accessing it from outside also meant setting up network tunneling or exposing my IP directly, which is effectively punching a hole in my home network's boundary that I then have to watch over long term.

The real push came from my friends. After I shared it with them, many of them told me: why is yours so laggy?

The problem was at the root: Navidrome and music-tag-web are both single-node designs. The node sits in some corner of the planet, and anyone far away has to fetch audio across half the world; tuning parameters can't fix that. EdgeSonic's data layer is, in the end, also a single point, but its entry points are spread across a global network. Combined with a fairly aggressive preloading strategy (buffering the next track ahead of time and caching finished tracks locally), in practice it comes close to being smoothly accessible from anywhere in the world.

## 2. I bought a closed-source version, then got more tired with every patch

To fill the gap in tag management, I bought the version of music-tag-web after it went closed source. While using it, I dug out a security vulnerability. Luckily it could only escalate a regular user to administrator, and I reported it to the developer privately and responsibly.

That wasn't the end of it. Later I found several UI-level issues on the web pages. I had paid money, yet I couldn't see what was inside and couldn't modify it to suit my needs. All I could do was patch from the outside: inject fix scripts at the nginx layer, then forward risky APIs to a security mitigation layer I built myself. Honestly, I started to get tired of it. The more I patched a black box, the more I felt like I was doing maintenance on someone else's behalf.

So I set a rule for myself: anything I want to depend on long term must be readable and modifiable. That's also why EdgeSonic uses AGPL. I hope that when others come across it, they won't end up in the situation I was in.

## 3. After getting IRIS working, I started thinking about building one myself

There was also a question of timing. In May, I got the design of an Agent workflow working on a private project, which became v0.2 of IRIS. At the time it wasn't yet a complete harness, just a mid-sized plugin: it gave the Agent's tasks plans, records, and audits, so the project's state could sustain itself. That self-maintaining system alone was already enough to support complex website development.

From then on, I slowly began to think: since there's no reasonable piece of software out there to do this, I could open-source one myself. And it looked like I could most likely build it in my spare time between classes and my internship, at a cost I could afford.

Rather than retread a path others have already walked, I'd prefer to go somewhere no one has been and leave signposts for those who follow. Open-sourcing EdgeSonic is in that spirit too.

## 4. The most expensive cost is patching

The most underestimated cost of self-hosting isn't hardware, it's **patching in a timely way**: the OS, containers, reverse proxies, dashboards, every dependency. You can't miss a single link, and it never ends.

When Anthropic released [Project Glasswing](https://engadget.com/2180028/anthropic-claude-mythos-preview-project-glasswing-update) (the Glasswing initiative), I realized the next few years might bring the largest wave of mass attacks yet. Two points in the public reporting stuck with me: more than ten thousand high-severity and critical vulnerabilities were found in a single month, and Anthropic itself admitted that finding vulnerabilities is much easier than fixing them, with some partners unable to patch even as fast as vulnerabilities were being discovered.

Applied to personal self-hosting, it hurts even more. Large companies have security teams dedicated to working through the patch queue; I don't. Finding holes keeps getting cheaper, but patching requires someone on duty, and an individual's time on duty is fixed. My home server sits at the very end of the patch chain: the last to be notified and the slowest to be fixed.

Besides, even if I know where the holes are, I may not feel like fixing them.

## 5. So, hand the maintenance off

The whole design revolves around one question: how do I minimize the parts that need to be watched long term? The conclusion is plain: **let people who are able to watch patches every day do the watching, and I'll only take care of the code I wrote myself.**

Workers run on V8 isolates, and the runtime is controlled and updated by Cloudflare itself, with a V8 patch gap of under 24 hours. The host OS, SSH, always-open ports, kernel vulnerabilities: that entire layer is no longer my concern.

The architecture is kept as light as possible: Worker, D1, R2, plus a small number of Durable Objects. There's little that can go wrong to begin with, and when something does, it's easy to see clearly.

The math works out reasonably well too. R2 standard storage is $0.015/GB·month with 10 GB free and no charge for egress; the Workers paid plan is $5/month and includes ten million requests.

A five-dollar plan plus a few dollars of storage fees is about the price of one music subscription, and in return I don't buy hard drives, don't pay for electricity, and don't have to crawl out of bed in the middle of the night to deal with “the service is down.” For me, that's a pretty good deal.

## 6. Pitfalls along the way

**Cloudflare has no audio transcoding API.** I came up with two approaches.

The first is pre-transcoding: use a highly compressed, low-loss format like Opus to save space, while keeping the original WAV files as they are.

The second is on-demand transcoding, split into two paths. On the free plan, let the browser do the labor: a Durable Object dispatches tasks through a hibernating WebSocket to idle browsers, which automatically pause during playback and write the results back once transcoding finishes. On the paid plan, use a Container to spin up ffmpeg temporarily for transcoding.

**Worker connection issues.** If audio passes through the Worker, bandwidth and connection stability for large files aren't ideal. So I added a 302 mode: the Worker only handles signing and redirecting, and the browser fetches audio directly from R2. In my own experience, loading speed is good enough even in mainland China.

**The NAS becomes an optional storage backend.** WebDAV, S3-compatible storage, and another Subsonic server can all be connected, while EdgeSonic handles indexing, the user system, and the client protocol. People who already have a NAS can keep their data and use it as the backend.

## 7. Where should a private service for a new era grow next?

Once it was usable, I started asking myself what else a music service should grow into.

**Migration shouldn't gamble all your data.** EdgeSonic can copy and sync content from other services: it pulls tracks, users, playlists, and stars from Subsonic services like Navidrome, and can resume if interrupted. In the other direction, it can also push favorites and playlists back upstream.

**Connecting with friends.** I designed a forward-looking node interconnection scheme: EdgeSonic instances that trust each other can exchange the tracks each can provide and search across nodes, so you and your friends automatically aggregate the resources you can each access.

**Karaoke mode.** I love singing, and many albums exist only in my library and can't be found in commercial karaoke apps. So it can open a temporary room, friends scan a QR code to pick songs on their phones, and it also supports loading video. A music library isn't just for listening.

**Single sign-on.** Personal services keep multiplying, and relying only on username and password login is not a good idea. So the browser side supports OIDC single sign-on.

**Isolating clients well.** The Subsonic ecosystem dictates that clients still have to use password-based accounts. By not using the master password, a problem in any one client can't give it access to EdgeSonic's high-privilege internal interfaces.

**Deployment has two paths too.** I think deployment for a private service in the new era should follow two paths:

- The first lowers the prerequisite knowledge, which is why Overture exists. It's a guided, zero-code deployment tool modeled on Microsoft's OOBE: you walk through it step by step in the browser, without touching the command line or code.
- The second makes things easy for expert users. The repository contains a deployment guide written for Agents: what to prepare, what to ask the user for, and how to verify that the service was really set up the way the user wanted. You hand the repository to your own Agent, and it asks you about the rest.

On the protocol side, it's compatible with Subsonic v1.16.1 and the OpenSubsonic extensions, and DSub, Symfonium, Substreamer, and Sonixd work out of the box. Tag editing, metadata fetching, and file organization are also built in, which are exactly the things I wanted in the first place.

## Give it a try

- Live demo: <https://edgesonic.lsy-demo.workers.dev/#/login>.
- Deployment: use the [Overture](https://overture.voidcarve.com/?src=lsy-404%2Fedgesonic) wizard in your browser, no local toolchain needed; or have an Agent deploy it for you following the guide in the repository, or use Wrangler yourself.
- Code and docs: [GitHub →](https://github.com/lsy-404/edgesonic)

This article is original content by its author, Siyu Lei. If you repost it, please credit the source and include a link to the original. (leisiyu.dev)
