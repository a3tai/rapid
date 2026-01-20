package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Create a new Wails application
	app := application.New(application.Options{
		Name:        "RAPID Dashboard",
		Description: "Multi-agent AI development orchestration",
		Services: []application.Service{
			application.NewService(NewAppService()),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	// Create main window with dark theme
	app.NewWebviewWindowWithOptions(application.WebviewWindowOptions{
		Title:  "RAPID Dashboard",
		Width:  1280,
		Height: 800,
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
		BackgroundColour: application.NewRGB(18, 18, 18), // Dark background matching design system
		URL:              "/",
		MinWidth:         800,
		MinHeight:        600,
	})

	// Run the application
	err := app.Run()
	if err != nil {
		log.Fatal(err)
	}
}
