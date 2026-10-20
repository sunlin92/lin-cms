package main

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestBuildMcpConfigParseableNoSecret(t *testing.T) {
	text := buildMcpConfig()
	var parsed struct {
		MCPServers map[string]struct {
			Command string            `json:"command"`
			Args    []string          `json:"args"`
			Env     map[string]string `json:"env"`
		} `json:"mcpServers"`
	}
	if err := json.Unmarshal([]byte(text), &parsed); err != nil {
		t.Fatalf("配置片段必须是合法 JSON：%v", err)
	}
	server, ok := parsed.MCPServers["lin-cms"]
	if !ok || server.Command != "lin-cms" || len(server.Args) != 1 || server.Args[0] != "mcp" {
		t.Fatalf("配置形态错误：%+v", server)
	}
	if strings.Contains(strings.ReplaceAll(text, "${LIN_CMS_AGENT_TOKEN}", ""), "lin_agent_") {
		t.Fatal("配置片段不得包含真实 Token")
	}
	if !strings.Contains(text, "${LIN_CMS_AGENT_TOKEN}") {
		t.Fatal("缺少 Token 占位符")
	}
}

func TestUnknownCommandReturns2(t *testing.T) {
	if code := run([]string{"nope"}); code != 2 {
		t.Fatalf("未知命令应返回 2，得到 %d", code)
	}
}
