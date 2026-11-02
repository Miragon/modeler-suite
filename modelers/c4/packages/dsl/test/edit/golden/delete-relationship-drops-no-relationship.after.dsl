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
            gateway = deploymentNode "Gateway" {
                proxy = infrastructureNode "Proxy"
            }
        }
    }
    views {
        container shop "Containers" {
            include *
            autoLayout tb 300 160
        }
    }
}
