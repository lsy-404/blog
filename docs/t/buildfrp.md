---
lang: zh-CN
icon: material-symbols:private-connectivity-outline
title: 浅记一次北美Frp搭建
date: 2024-01-26
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

轻量级个人FRP服务搭建教程 {.textkai}

<!-- more -->

国内就没必要这玩意了，SakuraFrp就行。要自建也可以当参考。

Frp是一个轻量级的反向代理工具，可以将内网服务映射到公网，实现内网穿透。

这大概算我找到的最便宜的内网穿透方案了。可以用来部署远程桌面、FTP文件传输或者Minecraft服务器啥的。

需要的东西：

- 一个VPS（一般价格在15-30元/月）
- 一个域名（可选，com一般在75-100元/年左右）
- Xshell（或者其他SSH管理工具）
- Xftp（或者其他文件传输工具）

服务商选用IONOS我选的是最便宜的$2/月的VPS，配置为（1 vCore CPU，1 GB RAM，10 GB SSD storage，1 Gbit/s unlimited traffic），这玩意搭建个人FRP绰绰有余。（折合约人民币15元/月）

实测IONOS Speedtest，有frp使用情况下，Hosted by Clouvider Ltd (New York, NY) [6199.77 km]，Download: 1557.67 Mbit/s - 2678.73 Mbit/s；Upload: 886.07 Mbit/s - 1017.50 Mbit/s（多次测试）

建议仅限北美，其他地区自行寻找。

服务器系统方面选用ubuntu，买完等他配置一会就行，用Xshell连接服务器，输入用户名密码即可。（我懒得改密码了，就这样吧）

安装FRP，从github下载linux版本的FRP文件，解压，用xftp，连上服务器。

手动用xftp把Frps那个二进制文件丢到/usr/bin/下面，再找个你喜欢的地方写个ini文件，我这里是/etc/frp/frps.ini，内容如下：

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

将{frp-port}、{token}、{web-port}、{dashboard-port}、{admin}、{password}替换成你自己的端口和账户密码。

日志文件夹自己建一个，有权限就行。

然后退出去去IONOS VPS控制台，找到防火墙，把以上端口都开放或直接关闭（不是那么推荐，不过单frp的话直接关比较省心）。

然后在服务器上输入以下指令：

``` shell
nohup frps -c ini文件路径 &
```

试着登录一下分配ip，端口为{dashboard-port}，用户名密码为{admin}{password}，能登就行。

然后去创建一个systemd服务，路径为/etc/systemd/system/frps.service，内容如下：

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

然后去添加服务自启动：

``` shell
systemctl enable frps
```

然后重启服务器，看看能不能自启动。如果一切正常，这个服务器除了续费就不用管了。

如果有域名，可以配置一个子域名A记录到服务器ip就行，比如像我的就是frp&#46;wuyilingwei&#46;com。

然后去客户端下载对应平台的frp客户端，windows可以试试Frp GUI，用对应token和域名+端口配置就行了。配置完记得开防火墙就行。

北美低成本FRP服务搭建完毕。月均成本15元人民币（或2美刀，支持paypel），带宽1Gbps，独享ip，流量无限制。

本文为作者 Siyu Lei 原创内容，转载请注明出处并附上原文链接。（leisiyu.dev）
