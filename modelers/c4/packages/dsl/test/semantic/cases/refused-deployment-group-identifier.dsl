workspace {
    model {
        live = deploymentEnvironment "Live" {
            servers = group "Servers" {
                server = deploymentNode "Server"
            }
        }
        servers = person "Servers"
    }
}
