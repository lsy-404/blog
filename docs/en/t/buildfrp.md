---
lang: en-US
icon: 'material-symbols:private-connectivity-outline'
title: A Brief Note on Setting Up FRP in North America
date: 2024-01-26T00:00:00.000Z
category:
  - 技术分享
tag:
  - 教程
  - Ubuntu
  - Frp
  - 端口转发
  - 北美
  - North America
  - VPS
---

A Lightweight Personal FRP Service Setup Tutorial {.textkai}

<!-- more -->

If you're in mainland China, you don't need this—SakuraFrp is enough. If you want to self-host, this can still serve as a reference.

Frp is a lightweight reverse proxy tool that can map internal network services to the public internet, enabling NAT traversal.

This is probably the cheapest NAT traversal solution I've found. You can use it to deploy remote desktop, FTP file transfer, or a Minecraft server, and so on.

What you'll need:

- A VPS (usually priced at around 15-30 CNY/month)
- A domain name (optional; a .com usually costs around 75-100 CNY/year)
- Xshell (or another SSH management tool)
- Xftp (or another file transfer tool)

For the provider I chose IONOS. I picked the cheapest $2/month VPS, with the specs (1 vCore CPU, 1 GB RAM, 10 GB SSD storage, 1 Gbit/s unlimited traffic), which is more than enough for a personal FRP setup. (About 15 CNY/month.)

IONOS Speedtest results with frp running: Hosted by Clouvider Ltd (New York, NY) [6199.77 km], Download: 1557.67 Mbit/s - 2678.73 Mbit/s; Upload: 886.07 Mbit/s - 1017.50 Mbit/s (multiple tests).

This is recommended for North America only; for other regions, please look elsewhere.

For the server operating system I chose Ubuntu. After purchasing, just wait a little while for it to be provisioned, then connect to the server with Xshell and enter your username and password. (I was too lazy to change the password, so I left it as it is.)

To install FRP, download the Linux version of the FRP files from GitHub, extract them, and connect to the server with Xftp.

Use Xftp to manually upload the frps binary to /usr/bin/, then write an ini file wherever you like. Mine is at /etc/frp/frps.ini, with the following content:

``` ini
[common]
# frp对客户端的服务端口
bind_port = {frp-port}
# token，客户端会用到，改的复杂些
token = {token}
# 访问frp客户端web服务的端口
vhost_http_port = {web-port}
# pool_count（下限），max_pool_count（上限）
max_pool_count = 50
# tcp流多路复用，默认为true
tcp_mux = true
 
# frp管理后台端口
dashboard_port = {dashboard-port}
# frp管理后台用户名和密码
dashboard_user = {admin}
dashboard_pwd = {password}
# 允许服务监控
enable_prometheus = true
# frp日志配置
log_file = /srv/frp/log
log_level = info
log_max_days = 3
```

Replace {frp-port}, {token}, {web-port}, {dashboard-port}, {admin}, and {password} with your own ports and account credentials.

Create the log folder yourself; it just needs to have the right permissions.

Then go to the IONOS VPS console, find the firewall, and open all of the ports above, or simply turn the firewall off (not that highly recommended, but if you're only running frp, turning it off is the easier option).

Then enter the following commands on the server:

``` shell
nohup frps -c ini文件路径 &
```

Try logging in to the dashboard at the assigned IP, on port {dashboard-port}, with the username and password {admin} and {password}. As long as you can log in, you're good.

Then create a systemd service at /etc/systemd/system/frps.service with the following content:

``` ini
[Unit]
# 服务名称，可自定义
Description = frp server
After = network.target syslog.target
Wants = network.target
 
[Service]
# 启动失败后重启服务
Restart=on-failure
# 重启间隔时间
RestartSec=5
# 修改为自己的frp目录，注意是frps
ExecStart=/usr/bin/frps -c /etc/frp/frps.ini
 
[Install]
WantedBy=multi-user.target
```

Then enable the service to start on boot:

``` shell
systemctl enable frps
```

Then reboot the server and check whether it starts automatically. If everything works, you won't need to touch this server again except to renew it.

If you have a domain name, you can configure a subdomain A record pointing to the server IP, like mine: frp&#46;wuyilingwei&#46;com.

Then download the frp client for your platform. On Windows you can try Frp GUI; just configure it with the matching token and the domain + port. Remember to open the firewall after configuring.

Your low-cost North American FRP service is now set up. The average monthly cost is 15 CNY (or $2, with PayPal supported), with 1 Gbps bandwidth, a dedicated IP, and unlimited traffic.

This article is original content by the author Siyu Lei. If you repost it, please credit the source and include a link to the original. (leisiyu.dev)
