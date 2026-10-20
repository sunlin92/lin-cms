// Package mcpbridge 用官方 go-sdk 构建 stdio MCP 服务器，
// 六个内容工具转发到 CMS REST API（与后端 /mcp 同一服务端授权链）。
package mcpbridge

import (
	"context"
	"fmt"

	"lin-cms-cli/internal/cmsclient"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// Version 与 CLI 版本一致（main 注入）。
type (
	listRecordsIn struct {
		TypeKey string `json:"type_key"`
		Page    int    `json:"page,omitempty"`
		Count   int    `json:"count,omitempty"`
	}
	recordIn struct {
		TypeKey  string `json:"type_key"`
		RecordID int    `json:"record_id"`
	}
	createIn struct {
		TypeKey string         `json:"type_key"`
		Data    map[string]any `json:"data"`
	}
	updateIn struct {
		TypeKey  string         `json:"type_key"`
		RecordID int            `json:"record_id"`
		Patch    map[string]any `json:"patch"`
	}
)

var Version = "0.1.0"

// NewServer 构建注册了六个内容工具的 MCP Server。
func NewServer(client *cmsclient.Client) *mcp.Server {
	server := mcp.NewServer(&mcp.Implementation{Name: "lin-cms", Version: Version}, nil)

	mcp.AddTool[struct{}, []map[string]any](server, &mcp.Tool{
		Name:        "list_content_types",
		Description: "列出当前 Token 有权访问的内容类型与操作",
	}, func(ctx context.Context, req *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, []map[string]any, error) {
		out, err := client.ListContentTypes()
		return nil, out, toolError(err)
	})

	mcp.AddTool[listRecordsIn, map[string]any](server, &mcp.Tool{
		Name:        "list_content_records",
		Description: "分页列出某内容类型的记录（page 从 0 起、count 1..15）",
	}, func(ctx context.Context, req *mcp.CallToolRequest, in listRecordsIn) (*mcp.CallToolResult, map[string]any, error) {
		out, err := client.ListContentRecords(in.TypeKey, in.Page, in.Count)
		return nil, out, toolError(err)
	})

	mcp.AddTool[recordIn, map[string]any](server, &mcp.Tool{
		Name:        "get_content_record",
		Description: "读取一条内容记录",
	}, func(ctx context.Context, req *mcp.CallToolRequest, in recordIn) (*mcp.CallToolResult, map[string]any, error) {
		out, err := client.GetContentRecord(in.TypeKey, in.RecordID)
		return nil, out, toolError(err)
	})

	mcp.AddTool[createIn, map[string]any](server, &mcp.Tool{
		Name:        "create_content_record",
		Description: "新增一条内容记录",
	}, func(ctx context.Context, req *mcp.CallToolRequest, in createIn) (*mcp.CallToolResult, map[string]any, error) {
		out, err := client.CreateContentRecord(in.TypeKey, in.Data)
		return nil, out, toolError(err)
	})

	mcp.AddTool[updateIn, map[string]any](server, &mcp.Tool{
		Name:        "update_content_record",
		Description: "按字段合并更新一条内容记录",
	}, func(ctx context.Context, req *mcp.CallToolRequest, in updateIn) (*mcp.CallToolResult, map[string]any, error) {
		out, err := client.UpdateContentRecord(in.TypeKey, in.RecordID, in.Patch)
		return nil, out, toolError(err)
	})

	destructive := true
	mcp.AddTool[recordIn, map[string]any](server, &mcp.Tool{
		Name:        "delete_content_record",
		Description: "软删除一条内容记录（破坏性操作，管理员可恢复）",
		Annotations: &mcp.ToolAnnotations{DestructiveHint: &destructive},
	}, func(ctx context.Context, req *mcp.CallToolRequest, in recordIn) (*mcp.CallToolResult, map[string]any, error) {
		out, err := client.DeleteContentRecord(in.TypeKey, in.RecordID)
		return nil, out, toolError(err)
	})

	return server
}

// RunStdio 在 stdio 上运行服务器（stdout 仅协议帧）。
func RunStdio(ctx context.Context, client *cmsclient.Client) error {
	return NewServer(client).Run(ctx, &mcp.StdioTransport{})
}

// toolError 把信封错误整理成机器可读文本（handler 返回 error 时 SDK 置 IsError）。
func toolError(err error) error {
	if env, ok := err.(*cmsclient.EnvelopeError); ok {
		return fmt.Errorf("code=%d: %s", env.Code, env.Message)
	}
	return err
}
