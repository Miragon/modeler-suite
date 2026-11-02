workspace "Shop" {
    model {
        customer = person "Customer"
        shop = softwareSystem "Shop" {
            web = container "Web" "Serves pages." "Java"
            api = container "API" {
                orders = component "Orders"
            }
            container_91t3 = container "Container"
        }
        customer -> web "Uses"
        web -> api "Calls"
        api -> container_91t3
    }
    views {
        container shop "ShopContainers" {
            include *
            autoLayout tb
            properties {
                "c4modeler.element.api" "0,552"
                "c4modeler.element.container_91t3" "0,720"
                "c4modeler.element.customer" "0,0"
                "c4modeler.element.web" "0,296"
            }
        }
        component api "ApiComponents" {
            include *
            autoLayout tb
        }
    }
}
