from flask import Flask, request
from flask_cors import CORS
import subprocess
import threading
import time
import platform

app = Flask(__name__)
CORS(app)
AI_MODEL = "Doubao"

# 检测操作系统
IS_WINDOWS = platform.system() == 'Windows'
IS_MACOS = platform.system() == 'Darwin'

# Windows 特有模块（延迟导入）
if IS_WINDOWS:
    try:
        import win32gui
        import win32com.client

        WINDOWS_MODULES_AVAILABLE = True
    except ImportError:
        print("警告: pywin32 未安装，Windows 功能不可用")
        print("请运行: pip install pywin32")
        WINDOWS_MODULES_AVAILABLE = False
else:
    WINDOWS_MODULES_AVAILABLE = False

# ============== 全局鼠标事件监听 ==============
# 需要安装: pip install pynput
# Windows 还需要: pip install pywin32

try:
    from pynput import mouse

    # 记录右键双击状态
    mouse_state = {
        'last_right_click_time': 0,  # 上次右键点击时间
        'last_trigger_time': 0,  # 上次触发切换的时间
        'last_switch_to_ai_time': 0,  # 上次从 PDF 切换到ai的时间
        'previous_app': ''  # 记录上一次的前台应用
    }

    # 双击间隔和防抖时间
    RIGHT_DOUBLE_CLICK_INTERVAL = 0.2  # 双击间隔 200ms
    TRIGGER_COOLDOWN = 0.3  # 触发后冷却时间 0.3秒（防止事件穿透）
    SWITCH_TO_AI_COOLDOWN = 0.05  # 从 Chrome 切换到AI后的冷却时间0.05秒

    # 需要监听的应用列表，双击右键时切换到 Chrome
    SWITCH_APPS = [AI_MODEL, 'OBS', 'OBS Studio']

    # 排除来源：如果是从这些应用切换过来的，则不触发切换回 Chrome
    EXCLUDE_SOURCE_APPS = ['Google Chrome', 'Chrome']


    def get_frontmost_app():
        """获取当前最前面的应用名称（跨平台）"""
        if IS_WINDOWS:
            if not WINDOWS_MODULES_AVAILABLE:
                return ""
            try:
                window = win32gui.GetForegroundWindow()
                return win32gui.GetWindowText(window)
            except Exception as e:
                print(f"获取前台窗口失败: {e}")
                return ""
        else:  # macOS
            script = 'tell application "System Events" to get name of first process whose frontmost is true'
            result = subprocess.run(
                ['osascript', '-e', script],
                capture_output=True,
                text=True
            )
            return result.stdout.strip()


    def switch_to_chrome():
        """切换到 Chrome（跨平台）"""
        print("切换到 Chrome!")
        if IS_WINDOWS:
            if not WINDOWS_MODULES_AVAILABLE:
                print("Windows 模块不可用，无法切换")
                return
            try:
                shell = win32com.client.Dispatch("WScript.Shell")
                # 尝试激活 Chrome 窗口
                if not shell.AppActivate("Chrome"):
                    # 如果 Chrome 没有运行，启动它
                    subprocess.Popen(['start', 'chrome'], shell=True)
            except Exception as e:
                print(f"切换到 Chrome 失败: {e}")
        else:  # macOS
            subprocess.run(['open', '-a', 'Google Chrome'])


    def switch_to_ai():
        """切换到ai（跨平台）"""
        print("切换到AI!")
        if IS_WINDOWS:
            if not WINDOWS_MODULES_AVAILABLE:
                print("Windows 模块不可用，无法切换")
                return
            try:
                shell = win32com.client.Dispatch("WScript.Shell")
                # 尝试激活AI窗口
                if not shell.AppActivate(AI_MODEL):
                    print("AI窗口未找到")
            except Exception as e:
                print(f"切换到AI失败: {e}")
        else:  # macOS
            subprocess.run(['open', '-a', AI_MODEL])


    def check_right_double_click():
        """检查是否是双击右键"""
        current_time = time.time()

        # 防抖：冷却时间内不触发（避免应用切换后事件穿透）
        if current_time - mouse_state['last_trigger_time'] < TRIGGER_COOLDOWN:
            print(f"冷却中，忽略点击")
            return False

        # 防止从 Chrome/PDF 切换到AI后又被切回去
        if current_time - mouse_state['last_switch_to_ai_time'] < SWITCH_TO_AI_COOLDOWN:
            print(f"刚从 Chrome 切换到AI，忽略点击")
            return False

        # 检查是否是双击（两次右键点击间隔小于 300ms）
        time_diff = current_time - mouse_state['last_right_click_time']

        if time_diff <= RIGHT_DOUBLE_CLICK_INTERVAL:
            # 是双击，检查当前应用
            frontmost_app = get_frontmost_app()
            print(f"双击右键! 当前应用: {frontmost_app}, 上一个应用: {mouse_state['previous_app']}")

            # 如果上一个应用是 Chrome，说明刚从 PDF 切换过来，不触发切换
            if any(exc.lower() in mouse_state['previous_app'].lower() for exc in EXCLUDE_SOURCE_APPS):
                print("忽略：刚从 Chrome 切换过来，不触发切换回 Chrome")
                mouse_state['previous_app'] = frontmost_app
                mouse_state['last_right_click_time'] = 0
                return False

            # 检查是否在目标应用中
            if any(app.lower() in frontmost_app.lower() for app in SWITCH_APPS):
                mouse_state['last_trigger_time'] = current_time
                mouse_state['last_right_click_time'] = 0  # 重置，防止连续触发
                mouse_state['previous_app'] = frontmost_app
                switch_to_chrome()
                return True
            else:
                # 更新上一个应用
                mouse_state['previous_app'] = frontmost_app

        # 记录本次点击时间
        mouse_state['last_right_click_time'] = current_time
        return False


    def on_click(x, y, button, pressed):
        """鼠标点击回调"""
        # 只处理右键按下事件
        if button == mouse.Button.right and pressed:
            check_right_double_click()


    def start_mouse_listener():
        """启动鼠标监听器（在单独线程中运行）"""
        print("全局鼠标监听已启动...")
        print(f"监听应用: {SWITCH_APPS}")
        print("在以上应用中双击右键将切换到 Chrome")
        with mouse.Listener(on_click=on_click) as listener:
            listener.join()


    # 在后台线程启动鼠标监听
    mouse_thread = threading.Thread(target=start_mouse_listener, daemon=True)
    mouse_thread.start()

except ImportError:
    print("警告: pynput 未安装，全局鼠标监听功能不可用")
    print("请运行: pip install pynput")


# ============== Flask 接口 ==============

@app.route('/pdf-click', methods=['POST'])
def handle_click():
    # 获取请求中的 action 参数
    data = request.get_json() or {}
    action = data.get('action', 'ctrl+z')  # 默认 ctrl+z

    print(f"收到信号: {action}")

    if IS_WINDOWS:
        # Windows: 使用 pyautogui 或直接发送按键
        try:
            import pyautogui
            # 根据 action 映射到 pyautogui 的按键
            key_map = {
                'ctrl+z': ['ctrl', 'z'],
                'ctrl+x': ['ctrl', 'x'],
                'ctrl+c': ['ctrl', 'c'],
                'ctrl+v': ['ctrl', 'v'],
            }
            if action not in key_map:
                print(f"未知的 action: {action}")
                return 'Unknown action', 400

            keys = key_map[action]
            pyautogui.hotkey(*keys)
        except ImportError:
            print("警告: pyautogui 未安装，无法发送按键")
            print("请运行: pip install pyautogui")
            return 'pyautogui not installed', 500
    else:
        # macOS: 使用 AppleScript
        # 根据 action 映射到 AppleScript 的按键
        key_map = {
            'ctrl+z': ('z', 'control down'),
            'ctrl+x': ('x', 'control down'),
            'ctrl+c': ('c', 'control down'),
            'ctrl+v': ('v', 'control down'),
            'cmd+z': ('z', 'command down'),
            'cmd+x': ('x', 'command down'),
            'option+z': ('z', 'option down'),
            'option+x': ('x', 'option down'),
            'option+mix': ('mix', 'option down'),
            # 可以继续添加更多映射...
        }

        if action not in key_map:
            print(f"未知的 action: {action}")
            return 'Unknown action', 400

        key, modifier = key_map[action]
        if key == "mix":
            import time
            for char, mod in [('c', 'option down'),('z', 'option down'),('u', 'option down')]:
                script = f'''
                tell application "System Events"
                    tell process "{AI_MODEL}"
                        keystroke "{char}" using {mod}
                    end tell
                end tell'''
                subprocess.run(['osascript', '-e', script], capture_output=True, text=True)
                time.sleep(0.5)  # 每个按键之间延时300毫秒
        else:
            # 构建 AppleScript
            script = f'''
            tell application "System Events"
                tell process "{AI_MODEL}"
                    keystroke "{key}" using {modifier}
                end tell
            end tell
            '''
            # 执行并捕获结果
            result = subprocess.run(
                ['osascript', '-e', script],
                capture_output=True,
                text=True
            )

    return 'OK'


@app.route('/pin-window', methods=['POST'])
def handle_pin_window():
    """独立的置顶窗口接口（跨平台）"""
    global mouse_state
    print("收到置顶窗口信号！")

    # 记录切换到豆包的时间（用于全局监听器判断）
    try:
        mouse_state['last_switch_to_ai_time'] = time.time()
        mouse_state['previous_app'] = 'Google Chrome'  # 标记来源是 Chrome
        print("已标记来源为 Chrome，防止切换回来")
    except:
        pass

    if IS_WINDOWS:
        # Windows: 使用 win32com 激活窗口
        if WINDOWS_MODULES_AVAILABLE:
            try:
                shell = win32com.client.Dispatch("WScript.Shell")
                # 尝试激活AI窗口
                if not shell.AppActivate(AI_MODEL):
                    print("AI窗口未找到")
            except Exception as e:
                print(f"切换到AI失败: {e}")
        else:
            print("Windows 模块不可用")
    else:
        # macOS: 使用 open 命令快速激活应用（不阻塞）
        result = subprocess.run(
            ['open', '-a', AI_MODEL],
            capture_output=True,
            text=True
        )
        print(f"置顶窗口完成, returncode: {result.returncode}")
        if result.stderr:
            print(f"stderr: {result.stderr}")

    return 'OK'


if __name__ == '__main__':
    print("\n" + "=" * 50)
    print("AI助手已启动")
    print("=" * 50)
    print(f"操作系统: {platform.system()}")
    print("功能列表:")
    print("  1. PDF点击信号接收 (端口 19527)")
    print("  2. 全局鼠标监听 - 双击右键切换到 Chrome")
    print("=" * 50)
    if IS_WINDOWS:
        print("Windows 依赖:")
        print("  - pip install pynput pywin32 pyautogui")
        if not WINDOWS_MODULES_AVAILABLE:
            print("  ⚠️  pywin32 未安装，部分功能不可用")
    else:
        print("macOS 依赖:")
        print("  - pip install pynput")
    print("=" * 50 + "\n")
    app.run(port=19527)
