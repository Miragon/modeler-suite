workspace {
    model {
        shop = softwareSystem "Shop" {
            web = container "Web"
            api = container "API"
        }
        live = deploymentEnvironment "Live" {
            deploymentNode "Server" {
                containerInstance web
                containerInstance api
            }
            web -/> api {
            }
        }
    }
}
