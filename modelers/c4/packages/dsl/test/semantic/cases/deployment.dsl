workspace {
    model {
        shop = softwareSystem "Shop" {
            api = container "API"
            db = container "DB"
            api -> db "Reads"
        }
        live = deploymentEnvironment "Live" {
            server = deploymentNode "Server" "" "Linux" {
                lb = infrastructureNode "Load Balancer"
                apiInstance = containerInstance api
                deploymentNode "Database Server" {
                    containerInstance db
                }
                lb -> apiInstance "Forwards"
            }
        }
        deploymentEnvironment "Test" {
            deploymentNode "Box" {
                softwareSystemInstance shop
            }
        }
    }
    views {
        deployment shop live "LiveDeployment" {
            include *
        }
        deployment * "Test" {
            include *
        }
        systemLandscape {
            include *
        }
    }
}
