---
lang: en-US
icon: 'line-md:cog-filled-loop'
title: G502(X) Universal Shooter Game Macro V2
date: 2026-06-24T00:00:00.000Z
category:
  - 技术分享
tag:
  - 教程
  - G Hub
  - 宏
---

Universal Shooter Game Macro for G502/G502X {.textkai}

<!-- more -->

Tested only on the G502X, using G HUB version 2025.2.687008.

G HUB must be installed. Other Logitech mice may be compatible after the key bindings are modified.

### Introduction

Use the mouse wheel's left G10 (-) and right G11 (+) to control the strength of the automatic recoil compensation.

Hold the shooting precision key G6 to switch between adjusting vertical/horizontal recoil; press it to display the current rate and working status in the console; double-click it to reset to default values.

Use the memory switch key G9 to turn this macro on or off.

The base code is adapted from Bilibili user @第一局永远tec-9.

### About Copyright

The original author has declared that they waive their copyright and have released the work to the public, but this modified version retains its copyright and is licensed under the Attribution-NonCommercial-ShareAlike 4.0 International license (CC BY-NC-SA 4.0).

Definition of commercial use:

Without the author's explicit permission, you may not sell, license, or otherwise charge a fee for this code, including but not limited to selling the software or incorporating it into a commercial product to generate profit (for example, charging for use or requiring follows/subscriptions).

### Code

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

This article is original content by the author Siyu Lei. When reposting, please credit the source and include a link to the original article. (leisiyu.dev)
