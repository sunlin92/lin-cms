package mcpbridge

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"lin-cms-cli/internal/cmsclient"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func startCMS(t *testing.T) (*httptest.Server, *[]string) {
	t.Helper()
	var paths []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.Method+" "+r.URL.Path)
		switch {
		case r.URL.Path == "/api/v1/content-types/available":
			_, _ = w.Write([]byte(`[{"id":1,"key":"note","name":"笔记","ops":["read","create"],"field_count":2}]`))
		case r.Method == "POST" && r.URL.Path == "/api/v1/content/note":
			_, _ = w.Write([]byte(`{"id":7,"title":"来自Go"}`))
		case r.URL.Path == "/api/v1/content/note/7":
			_, _ = w.Write([]byte(`{"id":7,"title":"来自Go"}`))
		default:
			w.WriteHeader(http.StatusForbidden)
			_, _ = w.Write([]byte(`{"message":"无权执行该内容操作","code":10310,"request":""}`))
		}
	}))
	t.Cleanup(srv.Close)
	return srv, &paths
}

func TestSixToolsRegisteredAndForward(t *testing.T) {
	srv, paths := startCMS(t)
	client := cmsclient.New(srv.URL, "lin_agent_test_token")
	server := NewServer(client)

	clientTr, serverTr := mcp.NewInMemoryTransports()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go func() { _ = server.Run(ctx, serverTr) }()

	mc := mcp.NewClient(&mcp.Implementation{Name: "test-client", Version: "0"}, nil)
	session, err := mc.Connect(ctx, clientTr, nil)
	if err != nil {
		t.Fatalf("Connect: %v", err)
	}
	defer session.Close()

	tools, err := session.ListTools(ctx, nil)
	if err != nil {
		t.Fatalf("ListTools: %v", err)
	}
	names := map[string]bool{}
	for _, tool := range tools.Tools {
		names[tool.Name] = true
	}
	want := []string{"list_content_types", "list_content_records", "get_content_record", "create_content_record", "update_content_record", "delete_content_record"}
	for _, name := range want {
		if !names[name] {
			t.Errorf("缺少工具 %s", name)
		}
	}
	// delete 标注破坏性
	for _, tool := range tools.Tools {
		if tool.Name == "delete_content_record" {
			if tool.Annotations == nil || tool.Annotations.DestructiveHint == nil || !*tool.Annotations.DestructiveHint {
				t.Error("delete_content_record 未标注 destructiveHint")
			}
		}
	}

	// 转发：list_content_types
	res, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "list_content_types", Arguments: json.RawMessage(`{}`)})
	if err != nil || res.IsError {
		t.Fatalf("list_content_types: %v %+v", err, res)
	}
	if !strings.Contains(fmtContent(res), "note") {
		t.Errorf("list_content_types 未返回 note：%v", res.Content)
	}

	// 转发：create_content_record
	res, err = session.CallTool(ctx, &mcp.CallToolParams{
		Name:      "create_content_record",
		Arguments: json.RawMessage(`{"type_key":"note","data":{"title":"来自Go"}}`),
	})
	if err != nil || res.IsError {
		t.Fatalf("create_content_record: %v %+v", err, res)
	}

	// 信封错误 → IsError + code 文本
	res, err = session.CallTool(ctx, &mcp.CallToolParams{
		Name:      "get_content_record",
		Arguments: json.RawMessage(`{"type_key":"denied","record_id":1}`),
	})
	if err != nil {
		t.Fatalf("CallTool 协议错误：%v", err)
	}
	if !res.IsError || !strings.Contains(fmtContent(res), "10310") {
		t.Errorf("期望 IsError 且含 10310，得到 %+v", res)
	}

	forwarded := strings.Join(*paths, ",")
	if !strings.Contains(forwarded, "POST /api/v1/content/note") {
		t.Errorf("未见转发请求：%s", forwarded)
	}
}

func fmtContent(res *mcp.CallToolResult) string {
	if res.Content == nil {
		return ""
	}
	raw, _ := json.Marshal(res.Content)
	return string(raw)
}
