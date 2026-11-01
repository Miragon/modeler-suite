workspace {
    model {
        shop = softwareSystem "Shop" {
            web = container "Web"
            api = container "API"
        }
        web -> api "Calls"
        web -> api "Polls"
        live = deploymentEnvironment "Live" {
            deploymentNode "Server" {
                webInstance = containerInstance web
                containerInstance api
            }
            webInstance -/> api "Polls" {
            }
        }
    }
    views {
        container shop "Containers" {
            include *
        }
    }
}
