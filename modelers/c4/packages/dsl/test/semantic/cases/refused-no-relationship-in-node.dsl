workspace {
    model {
        shop = softwareSystem "Shop" {
            web = container "Web"
            api = container "API"
        }
        web -> api "Calls"
        live = deploymentEnvironment "Live" {
            deploymentNode "Server" {
                webInstance = containerInstance web
                apiInstance = containerInstance api
                webInstance -/> apiInstance {
                }
            }
        }
    }
}
