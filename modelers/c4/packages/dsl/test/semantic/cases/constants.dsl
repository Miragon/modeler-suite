!const SYSTEM "Payments"
workspace "${SYSTEM} workspace" {
    !var TEAM "Blue"
    model {
        !const DESCRIPTION """
            Takes "money"
              from customers
            """
        p = softwareSystem "${SYSTEM}" "${DESCRIPTION}" "${TEAM},Core"
        !var TEAM "Red"
        q = softwareSystem "${SYSTEM} 2" "${UNKNOWN}" "${TEAM}"
        p -> q "Sends ${TEAM}"
    }
}
