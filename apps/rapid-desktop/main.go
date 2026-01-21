package main

import (
	"embed"
	"os"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Create an instance of the app structure
	app := NewAppService()

	// Enable debug mode in dev or when DEBUG env is set
	isDebug := os.Getenv("DEBUG") != "" || os.Getenv("WAILS_DEBUG") != ""

	// Create application with options
	err := wails.Run(&options.App{
		Title:     "RAPID Dashboard",
		Width:     1280,
		Height:    800,
		MinWidth:  800,
		MinHeight: 600,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 18, G: 18, B: 18, A: 1},
		OnStartup:        app.startup,
		Debug: options.Debug{
			OpenInspectorOnStartup: isDebug,
		},
		Bind: []interface{}{
			app,
		},
		Mac: &mac.Options{
			TitleBar: &mac.TitleBar{
				TitlebarAppearsTransparent: true,
				HideTitle:                  false,
				HideTitleBar:               false,
				FullSizeContent:            true,
				UseToolbar:                 false,
				HideToolbarSeparator:       true,
			},
			WebviewIsTransparent: false,
			WindowIsTranslucent:  true,
			About: &mac.AboutInfo{
				Title:   "RAPID Dashboard",
				Message: "Multi-agent AI development orchestration\n(c) 2025, RAPID",
			},
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
