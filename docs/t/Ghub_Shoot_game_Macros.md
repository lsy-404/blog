---
lang: zh-CN
icon: line-md:cog-filled-loop
title: G502(X)通用射击游戏宏V2
date: 2026-06-24
category:
  - 技术分享
tag:
  - 教程
  - G Hub
  - 宏
---

射击游戏G502/G502X通用宏 {.textkai}

<!-- more -->

仅在G502X上测试过，使用G HUB版本为2025.2.687008。

必须安装G HUB，其他罗技鼠标可能在修改键位后兼容。

### 简介

通过鼠标滚轮左G10（-）右G11（+）来控制自动压枪力度

通过按住射击精度键G6的方式切换修改垂直/水平后座，按下以在控制台显示当前速率和工作状态，双击以重置默认值。

通过内存切换键G9开关此宏

基础代码借鉴自Bilibili@第一局永远tec-9

### 关于版权

原作者声明放弃版权公开，但此修改版保留版权并根据署名-非商业性-相同方式分享 4.0 国际 CC BY-NC-SA 4.0许可.

特对商业性使用定义：

未经作者明确许可，您不得出售、授权或以其他方式收取此代码的费用，包括但不限于销售软件或将其纳入商业产品产生盈利的部分（例如收费使用或者要求关注等行为）。

### 代码

~~~ lua
EnablePrimaryMouseButtonEvents(1)

-- ===== 用户可调参数（常量） =====
-- 按键映射
KEY_TOGGLE   = 9   -- 总开关（按一次切换 ON/OFF）
KEY_MODE     = 5   -- 调整模式（按住进入水平调整，释放退出）
KEY_INCREASE = 8   -- 增加速度（垂直或水平）
KEY_DECREASE = 7   -- 降低速度（垂直或水平）

-- 速度初始值及步长
INIT_SPEED   = 7.5   -- 默认垂直速度
INIT_HORI    = 0.0    -- 默认水平速度
VERT_STEP    = 1.5    -- 垂直调整步长
HORI_STEP    = 0.5    -- 水平调整步长

-- 双击重置阈值（毫秒）
DOUBLE_CLICK_MS = 300

-- 总开关默认状态true/false
k     = true

-- ===== 运行状态变量（勿动） =====
speed = INIT_SPEED
hori  = INIT_HORI
adjustHorizontal = false
lastPressMode = 0

-- ============================================
function OnEvent(event, arg)
    -- OutputLogMessage("Event: " .. event .. " Arg: " .. arg .. "\n")
    -- 需要调整按键删除面一行的“-- ”保存后点击即可获得当前按键代号，替换设置中的对应值即可
    if (event == "MOUSE_BUTTON_PRESSED" and arg == KEY_TOGGLE) then
        k = not k
        if k then OutputLogMessage("ON\n") else OutputLogMessage("OFF\n") end
    end

    if (event == "MOUSE_BUTTON_PRESSED" and arg == KEY_MODE) then
        local currentTime = GetRunningTime()
        if (currentTime - lastPressMode < DOUBLE_CLICK_MS) then
            speed = INIT_SPEED
            hori  = INIT_HORI
            adjustHorizontal = false
            OutputLogMessage("Reset to default: vertical=%.1f, horizontal=%.1f\n", INIT_SPEED, INIT_HORI)
            lastPressMode = 0
        else
            adjustHorizontal = true
            OutputLogMessage("Horizontal adjustment mode activated\n")
            lastPressMode = currentTime
        end
    end

    if (event == "MOUSE_BUTTON_RELEASED" and arg == KEY_MODE) then
        adjustHorizontal = false
        OutputLogMessage("Current vertical speed: %.1f\n", speed)
        OutputLogMessage("Current horizontal speed: %.1f\n", hori)
        if k then OutputLogMessage("ON\n") else OutputLogMessage("OFF\n") end
    end

    if (event == "MOUSE_BUTTON_PRESSED" and arg == KEY_INCREASE) then
        if adjustHorizontal then
            hori = hori + HORI_STEP
            OutputLogMessage("Horizontal speed increased to: %.1f\n", hori)
        else
            speed = speed + VERT_STEP
            OutputLogMessage("Vertical speed increased to: %.1f\n", speed)
        end
    end

    if (event == "MOUSE_BUTTON_PRESSED" and arg == KEY_DECREASE) then
        if adjustHorizontal then
            hori = hori - HORI_STEP
            OutputLogMessage("Horizontal speed decreased to: %.1f\n", hori)
        else
            speed = speed - VERT_STEP
            OutputLogMessage("Vertical speed decreased to: %.1f\n", speed)
        end
    end

    if k then
        Sleep(5)
        if IsMouseButtonPressed(1) then
            if IsMouseButtonPressed(3) then
                MoveMouseRelative(math.floor(hori + 0.5), math.floor(speed + 0.5))
                repeat
                    Sleep(5)
                    MoveMouseRelative(math.floor(hori + 0.5), math.floor(speed + 0.5))
                until not IsMouseButtonPressed(1) or not IsMouseButtonPressed(3)
            end
        end
    end
end
~~~

本文为作者 Siyu Lei 原创内容，转载请注明出处并附上原文链接。（leisiyu.dev）
