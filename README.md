
## 部署方式

- **Workers** 部署：复制 [_worker.js] 代码到cloud flare，`保存并部署`即可

## 如何使用？
例如 您的Workers项目域名为：`ddns.fxxk.workers.dev`；

1. 如你想将`yy.xx.eu.org`和`uu.xx.eu.org`内的IP解析到你的`ddns.google.com`下，你可以设置如下变量
    - 变量名`CUSTOM_IPS`，值为`yy.xx.eu.org,uu.xx.eu.org`，支持多元素之间使用`,`或**换行**作间隔；

2. 如你想将`https://ipdb.030101.xyz/api/bestproxy.txt`列表内的IP解析到你的`ddns.google.com`下，你可以设置如下变量
    - 变量名`IP_API`，值为`https://ipdb.030101.xyz/api/bestproxy.txt`，支持多元素之间使用`,`或**换行**作间隔；

### 手动执行
- 访问`https://ddns.fxxk.workers.dev/?password=[你的密码]`即可**手动执行**DDNS域名解析任务；
- 例如：https://fd2.1990909.xyz/?password=sd123
- https://【你的自定义域】/?password=【你的密码】
### 定时任务
- 设置添加`Cron 触发器`即可；
- 例如`0 */8 * * *`为**每8小时执行一次**，更多定时任务Cron写法请自行GPT。

## 变量说明
| 变量名 | 示例 | 必填 | 备注 |
|--------|---------|-|-----|
| CFMAIL  | `admin@gmail.com` |√| Cloudflare 登录邮箱 |
| DOMAIN  | `ddns.google.com` |√| Cloudflare 待解析域名 |
| ZONE_ID   | `6f0b34f36efb4bdaf5e22d68ac8e5c96` |√| Cloudflare 区域ID | 
| API_TOKEN  | `tGb4_4f5e23efb4d68ac28exRnJTfbdaC6-IWocs` |√| Cloudflare API令牌 |
| PASSWORD | `admin` |×| **手动执行**时验证密码，密码不正确拒绝访问 |
| CUSTOM_IPS | `cdn.xn--b6gac.eu.org``8.8.8.8` `2406:8dc0:6004:7019:ca7a:65a0:d3d7:1467` |×| 获取待解析至`待解析域名`IP的域名(支持多元素之间`,`或 换行 作间隔) |
| IP_API | `https://ipdb.030101.xyz/api/bestproxy.txt` |×| 通过API获取待解析至`待解析域名`IP的接口(支持多元素之间`,`或 换行 作间隔) |
### 空间设置
-创建一个KV空间命名为UPDATE_HISTORY

-绑定刚创建的KV空间UPDATE_HISTORY，变量名称也为UPDATE_HISTORY
