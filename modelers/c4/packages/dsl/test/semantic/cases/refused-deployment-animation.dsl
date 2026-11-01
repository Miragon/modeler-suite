workspace {
    model {
        shop = softwareSystem "Shop" {
            web = container "Web"
            db = container "Database"
        }
        web -> db
        live = deploymentEnvironment "Live" {
            deploymentNode "Server" {
                webInstance = containerInstance web
                dbInstance = containerInstance db
            }
        }
    }
    views {
        deployment shop live "Live" {
            include *
            animation {
                webInstance
                web
            }
        }
    }
}
