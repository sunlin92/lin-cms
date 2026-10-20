// lin-cms：Lin CMS 本机 CLI（Go）。
// 五命令：init / test / config / mcp / logout；stdout 仅 MCP 帧，诊断走 stderr 且脱敏。
package main

import (
	"bufio"
	"context"
	"flag"
	"fmt"
	"os"
	"strings"

	"lin-cms-cli/internal/cmsclient"
	"lin-cms-cli/internal/credentials"
	"lin-cms-cli/internal/mcpbridge"
	"lin-cms-cli/internal/redact"
)

var version = "0.1.0" // build.sh 经 -ldflags 注入

const protocolNote = "MCP stdio（go-sdk v1.8.0）"

func main() {
	os.Exit(run(os.Args[1:]))
}

func run(args []string) int {
	fs := flag.NewFlagSet("lin-cms", flag.ContinueOnError)
	fs.Usage = func() { usage(fs) }
	showVersion := fs.Bool("version", false, "打印版本")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	if *showVersion {
		fmt.Printf("lin-cms-cli %s（%s）\n", version, protocolNote)
		return 0
	}
	rest := fs.Args()
	if len(rest) == 0 {
		usage(fs)
		return 2
	}
	switch rest[0] {
	case "init":
		return cmdInit()
	case "test":
		return cmdTest()
	case "config":
		return cmdConfig(rest[1:])
	case "mcp":
		return cmdMCP()
	case "logout":
		return cmdLogout()
	default:
		fmt.Fprintf(os.Stderr, "未知命令：%s\n", rest[0])
		usage(fs)
		return 2
	}
}

func usage(fs *flag.FlagSet) {
	fmt.Fprint(os.Stderr, `lin-cms — Lin CMS 本机 CLI

用法：
  lin-cms init              输入 CMS Base URL（校验 /health）与 Agent Token，凭证入系统钥匙串
  lin-cms test              连通性 + Token + 内容类型只读探测
  lin-cms config [--out p]  输出通用 MCP 客户端配置 JSON（不含明文 Token）
  lin-cms mcp               运行 stdio MCP 服务器
  lin-cms logout            删除本机凭证（不吊销服务端 Token）
  lin-cms --version         版本信息
`)
}

func cmdInit() int {
	reader := bufio.NewReader(os.Stdin)
	fmt.Print("CMS Base URL（如 https://cms.example.com）: ")
	baseURL, _ := reader.ReadString('\n')
	baseURL = strings.TrimSpace(strings.TrimRight(baseURL, "/"))

	probe := cmsclient.New(baseURL, "lin_agent_probe_invalid")
	if _, err := probe.Health(); err != nil {
		fmt.Fprintf(os.Stderr, "✗ /health 不可达：%s\n", redact.Redact(err.Error()))
		return 1
	}
	fmt.Println("✓ /health 正常")

	fmt.Print("Agent Token（输入不回显，直接粘贴后回车）: ")
	token, _ := reader.ReadString('\n')
	token = strings.TrimSpace(token)
	if err := credentials.Save(baseURL, token); err != nil {
		fmt.Fprintf(os.Stderr, "✗ %s\n", redact.Redact(err.Error()))
		return 1
	}
	fmt.Println("✓ 凭证已保存（Token 入系统凭证库，base_url 入非秘密配置文件）")
	return 0
}

func cmdTest() int {
	creds, ok := credentials.Load()
	if !ok {
		fmt.Fprintln(os.Stderr, "✗ 未找到凭证：请先 lin-cms init，或设置 LIN_CMS_BASE_URL / LIN_CMS_AGENT_TOKEN")
		return 1
	}
	client := cmsclient.New(creds.BaseURL, creds.Token)
	health, err := client.Health()
	if err != nil {
		fmt.Fprintf(os.Stderr, "✗ 失败：%s\n", redact.Redact(err.Error()))
		return 1
	}
	fmt.Printf("✓ /health: %v\n", health)
	types, err := client.ListContentTypes()
	if err != nil {
		fmt.Fprintf(os.Stderr, "✗ Token 探测失败：%s\n", redact.Redact(err.Error()))
		return 1
	}
	fmt.Printf("✓ Token 有效，可见 %d 个内容类型（只读探测）\n", len(types))
	for _, item := range types {
		name, _ := item["name"].(string)
		key, _ := item["key"].(string)
		fmt.Printf("  - %s（%s）ops=%v\n", key, name, item["ops"])
	}
	return 0
}

func cmdConfig(args []string) int {
	fs := flag.NewFlagSet("config", flag.ContinueOnError)
	out := fs.String("out", "", "写入指定路径（不写 Token 明文）")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	text := buildMcpConfig()
	if *out != "" {
		if err := os.WriteFile(*out, []byte(text), 0o644); err != nil {
			fmt.Fprintf(os.Stderr, "✗ 写入失败：%v\n", err)
			return 1
		}
		fmt.Printf("已写入 %s（不含真实 Token）\n", *out)
		return 0
	}
	fmt.Println(text)
	return 0
}

// buildMcpConfig 生成通用 MCP 客户端配置片段：占位符需在客户端进程环境中设置。
func buildMcpConfig() string {
	return `{
  "mcpServers": {
    "lin-cms": {
      "command": "lin-cms",
      "args": ["mcp"],
      "env": {
        "LIN_CMS_BASE_URL": "${LIN_CMS_BASE_URL}",
        "LIN_CMS_AGENT_TOKEN": "${LIN_CMS_AGENT_TOKEN}"
      }
    }
  }
}`
}

func cmdMCP() int {
	creds, ok := credentials.Load()
	if !ok {
		fmt.Fprintln(os.Stderr, "✗ 未找到凭证：请先 lin-cms init 或设置环境变量")
		return 1
	}
	mcpbridge.Version = version
	client := cmsclient.New(creds.BaseURL, creds.Token)
	if err := mcpbridge.RunStdio(context.Background(), client); err != nil {
		fmt.Fprintf(os.Stderr, "stdio 会话结束：%s\n", redact.Redact(err.Error()))
		return 1
	}
	return 0
}

func cmdLogout() int {
	if credentials.Delete() {
		fmt.Println("✓ 已删除本机凭证（服务端 Token 未吊销；如需吊销请到 Web 端操作）")
		return 0
	}
	fmt.Println("✗ 没有可删除的本机凭证")
	return 1
}
