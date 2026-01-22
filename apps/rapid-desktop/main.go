package main

import (
	"embed"
	"fmt"
	"log"
	"os"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Create an instance of the app service
	appService := NewAppService()

	// Check if running in dev mode (WAILS_VITE_PORT env var is set by wails3 dev)
	vitePort := os.Getenv("WAILS_VITE_PORT")
	isDev := vitePort != ""

	// Create the application
	appOptions := application.Options{
		Name:        "RAPID Dashboard",
		Description: "Multi-agent AI development orchestration",
		Services: []application.Service{
			application.NewService(appService),
		},
	}

	// Configure assets
	// In dev mode: Set FRONTEND_DEVSERVER_URL and use AssetFileServerFS which will
	//              create a reverse proxy to Vite when that env var is set
	// In production: Serve embedded assets directly
	if isDev {
		if vitePort == "" {
			vitePort = "9245"
		}
		devURL := fmt.Sprintf("http://localhost:%s", vitePort)
		os.Setenv("FRONTEND_DEVSERVER_URL", devURL)
		log.Printf("Dev mode: FRONTEND_DEVSERVER_URL=%s", devURL)
	}

	// Always set up the asset handler - in dev mode with FRONTEND_DEVSERVER_URL set,
	// AssetFileServerFS returns a reverse proxy to the Vite dev server
	appOptions.Assets = application.AssetOptions{
		Handler: application.AssetFileServerFS(assets),
	}

	app := application.New(appOptions)

	// Use "/" as the window URL - Wails internally calls GetStartURL() which converts it to
	// the proper wails://localhost:PORT/ URL when FRONTEND_DEVSERVER_URL is set
	windowURL := "/"
	log.Printf("Window URL: %s (Wails will convert to wails:// scheme in dev mode)", windowURL)

	// Create the main window
	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:     "RAPID Dashboard",
		Width:     1280,
		Height:    800,
		MinWidth:  800,
		MinHeight: 600,
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
		BackgroundColour: application.NewRGB(18, 18, 18),
		URL:              windowURL,
	})

	// Run the application
	err := app.Run()
	if err != nil {
		log.Fatal(err)
	}
}
